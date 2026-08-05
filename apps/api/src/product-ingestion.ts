import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  AwinFeedImportResponse,
  ImportAwinFeed,
  TenantContext,
} from "@profit-pilot/contracts";
import {
  completeAwinFeedSync,
  completeUnmodifiedFeedSync,
  failAwinFeedSync,
  reserveAwinFeedSync,
  type NormalizedProductOpportunity,
} from "@profit-pilot/db";

import { AwinFeedValidationError, type AwinClient, type AwinFeedDownload } from "./awin.js";
import type { AwinCredentialResolver } from "./secrets.js";

export const OPPORTUNITY_SCORE_VERSION = "awin-v1.0.0";
const MAX_SOURCE_PAYLOAD_BYTES = 128 * 1_024;
const MAX_REJECTION_RATE = 0.05;

const sourceProductSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    title: z.string().trim().min(1).max(240),
  })
  .passthrough();

interface PriceValue {
  amount: number;
  currency: string;
}

interface ScoreInput {
  available: boolean;
  observedAt: Date;
  listPrice: number | null;
  currentPrice: number | null;
  commissionRate: number | null;
  evidenceFields: number;
  scoredAt: Date;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function flattenProduct(raw: Record<string, unknown>): Record<string, unknown> {
  const productBasic = objectValue(raw.product_basic);
  if (Object.keys(productBasic).length === 0) return raw;

  return {
    ...productBasic,
    ...objectValue(raw.product_identifiers),
    ...objectValue(raw.price_and_availability),
    ...objectValue(raw.product_description),
    ...objectValue(raw.product_category),
    meta: raw.meta,
  };
}

function parsePrice(value: unknown): PriceValue | null {
  if (typeof value === "string") {
    const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Za-z]{3})$/);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return { amount, currency: match[2]!.toUpperCase() };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const amount = Number(record.amount);
    const currency = typeof record.currency === "string" ? record.currency.toUpperCase() : "";
    if (Number.isFinite(amount) && amount >= 0 && /^[A-Z]{3}$/.test(currency)) {
      return { amount, currency };
    }
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function saleIsEffective(value: unknown, observedAt: Date): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  const [startValue, endValue] = value.split("/", 2);
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return false;
  return observedAt >= start && observedAt <= end;
}

function isAvailable(product: Record<string, unknown>): boolean {
  if (typeof product.in_stock === "boolean") return product.in_stock;
  if (typeof product.is_for_sale === "boolean" && !product.is_for_sale) return false;
  if (typeof product.availability !== "string") return true;
  return ["in_stock", "preorder", "pre_order", "backorder"].includes(
    product.availability.toLowerCase(),
  );
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalKey(
  product: Record<string, unknown>,
  advertiserId: number,
  sourceProductId: string,
): string {
  for (const key of ["gtin", "ean", "upc"] as const) {
    if (hasText(product[key])) return `${key}:${String(product[key]).trim().toLowerCase()}`;
  }
  if (hasText(product.brand) && hasText(product.mpn)) {
    return `brand-mpn:${String(product.brand).trim().toLowerCase()}:${String(product.mpn).trim().toLowerCase()}`;
  }
  return `awin:${advertiserId}:${sourceProductId}`;
}

function merchantName(raw: Record<string, unknown>, advertiserId: number): string {
  const meta = objectValue(raw.meta);
  for (const candidate of [meta.advertiser_name, raw.merchant_name, raw.brand]) {
    if (hasText(candidate)) return String(candidate).trim().slice(0, 240);
  }
  return `Awin advertiser ${advertiserId}`;
}

export function scoreOpportunity(input: ScoreInput): NormalizedProductOpportunity["opportunity"] {
  const ageHours = Math.max(0, input.scoredAt.getTime() - input.observedAt.getTime()) / 3_600_000;
  const freshness =
    ageHours <= 6 ? 25 : ageHours <= 24 ? 21 : ageHours <= 72 ? 14 : ageHours <= 168 ? 7 : 0;
  const availability = input.available ? 20 : 0;
  const discountPercent =
    input.listPrice !== null &&
    input.currentPrice !== null &&
    input.listPrice > input.currentPrice &&
    input.listPrice > 0
      ? ((input.listPrice - input.currentPrice) / input.listPrice) * 100
      : 0;
  const discount = Math.round(Math.min(20, (discountPercent / 40) * 20));
  const estimatedCommission =
    input.currentPrice !== null && input.commissionRate !== null
      ? input.currentPrice * (input.commissionRate / 100)
      : null;
  const commission =
    estimatedCommission === null ? 0 : Math.round(Math.min(20, (estimatedCommission / 50) * 20));
  const evidence = Math.round(Math.min(15, (input.evidenceFields / 6) * 15));
  const rawScore = availability + freshness + discount + commission + evidence;
  const score = input.available ? Math.min(100, rawScore) : 0;

  return {
    score,
    scoreVersion: OPPORTUNITY_SCORE_VERSION,
    explanation: {
      components: { availability, freshness, discount, commission, evidence },
      discountPercent: Number(discountPercent.toFixed(2)),
      estimatedCommission:
        estimatedCommission === null ? null : Number(estimatedCommission.toFixed(4)),
      notes: [
        ...(input.commissionRate === null
          ? ["Commission rate is unknown, so no commission component was awarded."]
          : []),
        ...(!input.available ? ["Unavailable products are not eligible opportunities."] : []),
      ],
    },
    inputSnapshot: {
      available: input.available,
      observedAt: input.observedAt.toISOString(),
      listPrice: input.listPrice,
      currentPrice: input.currentPrice,
      commissionRate: input.commissionRate,
      evidenceFields: input.evidenceFields,
    },
  };
}

export function normalizeAwinProduct(
  raw: Record<string, unknown>,
  input: Pick<ImportAwinFeed, "advertiserId" | "commissionRate">,
  downloadedAt: Date,
): NormalizedProductOpportunity {
  if (Buffer.byteLength(JSON.stringify(raw), "utf8") > MAX_SOURCE_PAYLOAD_BYTES) {
    throw new Error("source payload exceeds the supported product size");
  }

  const flattened = flattenProduct(raw);
  const parsed = sourceProductSchema.parse(flattened);
  const listPrice = parsePrice(flattened.price);
  const parsedSalePrice = parsePrice(flattened.sale_price);
  const salePrice = saleIsEffective(flattened.sale_price_effective_date, downloadedAt)
    ? parsedSalePrice
    : null;
  const currentPrice = salePrice ?? listPrice;
  if (!currentPrice) throw new Error("product price and currency are missing or invalid");
  if (salePrice && listPrice && salePrice.currency !== listPrice.currency) {
    throw new Error("sale and list prices use different currencies");
  }

  const available = isAvailable(flattened);
  const observedAt = parseDate(flattened.last_updated) ?? downloadedAt;
  const expiresAt =
    parseDate(flattened.expiration_date) ?? new Date(observedAt.getTime() + 48 * 60 * 60 * 1_000);
  const evidenceFields = [
    flattened.description,
    flattened.link,
    flattened.image_link,
    flattened.brand,
    flattened.gtin ?? flattened.ean ?? flattened.upc,
    flattened.google_product_category ?? flattened.product_type,
  ].filter(hasText).length;
  const commissionRate = input.commissionRate ?? null;
  const opportunity = scoreOpportunity({
    available,
    observedAt,
    listPrice: listPrice?.amount ?? null,
    currentPrice: currentPrice.amount,
    commissionRate,
    evidenceFields,
    scoredAt: downloadedAt,
  });

  return {
    sourceProductId: `awin:${input.advertiserId}:${parsed.id}`.slice(0, 240),
    canonicalKey: canonicalKey(flattened, input.advertiserId, parsed.id),
    name: parsed.title,
    merchantName: merchantName(flattened, input.advertiserId),
    currency: currentPrice.currency,
    price: currentPrice.amount.toFixed(4),
    commissionRate: commissionRate === null ? null : commissionRate.toFixed(4),
    available,
    observedAt,
    expiresAt,
    sourcePayload: raw,
    opportunity,
  };
}

export interface ProductIngestionService {
  importAwinFeed(context: TenantContext, input: ImportAwinFeed): Promise<AwinFeedImportResponse>;
}

interface ProductIngestionDependencies {
  awinClient: AwinClient;
  credentialResolver: AwinCredentialResolver;
  now?: () => Date;
  reserve?: typeof reserveAwinFeedSync;
  complete?: typeof completeAwinFeedSync;
  completeUnmodified?: typeof completeUnmodifiedFeedSync;
  fail?: typeof failAwinFeedSync;
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : createHash("sha256").update(String(error)).digest("hex").slice(0, 24);
}

function normalizeDownload(
  download: Extract<AwinFeedDownload, { status: "downloaded" }>,
  input: ImportAwinFeed,
  downloadedAt: Date,
): { products: NormalizedProductOpportunity[]; rejected: number } {
  const productBySourceId = new Map<string, NormalizedProductOpportunity>();
  let rejected = 0;
  for (const raw of download.products) {
    try {
      const product = normalizeAwinProduct(raw, input, downloadedAt);
      if (productBySourceId.has(product.sourceProductId)) {
        rejected += 1;
      } else {
        productBySourceId.set(product.sourceProductId, product);
      }
    } catch {
      rejected += 1;
    }
  }

  const products = [...productBySourceId.values()];

  if (
    download.products.length > 0 &&
    (products.length === 0 || rejected / download.products.length > MAX_REJECTION_RATE)
  ) {
    throw new AwinFeedValidationError(
      "Too many Awin products failed normalization; the existing catalog was preserved",
    );
  }
  return { products, rejected };
}

export function createProductIngestionService({
  awinClient,
  credentialResolver,
  now = () => new Date(),
  reserve = reserveAwinFeedSync,
  complete = completeAwinFeedSync,
  completeUnmodified = completeUnmodifiedFeedSync,
  fail = failAwinFeedSync,
}: ProductIngestionDependencies): ProductIngestionService {
  return {
    async importAwinFeed(context, input) {
      const reservation = await reserve(context, input, now());
      try {
        const accessToken = await credentialResolver.resolveAccessToken(
          reservation.secretReference,
        );
        const download = await awinClient.downloadEnhancedFeed({
          accessToken,
          publisherId: input.publisherId,
          advertiserId: input.advertiserId,
          locale: input.locale,
          ...(reservation.sourceEtag ? { ifNoneMatch: reservation.sourceEtag } : {}),
          ...(reservation.sourceLastModifiedAt
            ? { ifModifiedSince: reservation.sourceLastModifiedAt }
            : {}),
        });
        const completedAt = now();

        if (download.status === "not_modified") {
          const nextEligibleAt = await completeUnmodified(context, reservation, completedAt);
          return {
            provider: "awin",
            status: "not_modified",
            feed: {
              publisherId: input.publisherId,
              advertiserId: input.advertiserId,
              locale: input.locale,
            },
            products: { received: 0, accepted: 0, rejected: 0 },
            nextEligibleAt: nextEligibleAt.toISOString(),
            completedAt: completedAt.toISOString(),
          };
        }

        const normalized = normalizeDownload(download, input, completedAt);
        const nextEligibleAt = await complete(context, reservation, normalized.products, {
          received: download.products.length,
          rejected: normalized.rejected,
          ...(download.etag ? { sourceEtag: download.etag } : {}),
          ...(download.lastModifiedAt ? { sourceLastModifiedAt: download.lastModifiedAt } : {}),
          completedAt,
        });
        return {
          provider: "awin",
          status: "ingested",
          feed: {
            publisherId: input.publisherId,
            advertiserId: input.advertiserId,
            locale: input.locale,
          },
          products: {
            received: download.products.length,
            accepted: normalized.products.length,
            rejected: normalized.rejected,
          },
          nextEligibleAt: nextEligibleAt.toISOString(),
          completedAt: completedAt.toISOString(),
        };
      } catch (error) {
        try {
          await fail(context, reservation, errorCode(error), now());
        } catch (recordingError) {
          throw new AggregateError(
            [error, recordingError],
            "Awin feed import failed and its failure state could not be recorded",
          );
        }
        throw error;
      }
    },
  };
}
