import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  contentDraftResponseSchema,
  type ContentDraftResponse,
  type CreateContentDraft,
  type TenantContext,
} from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  auditEvents,
  contentGenerationRequests,
  contentItems,
  contentRevisions,
  evidenceRecords,
  opportunities,
  products,
} from "./schema.js";

const GENERATION_LEASE_MS = 10 * 60 * 1_000;
const MAX_FACT_VALUE_LENGTH = 600;

export interface GroundingFact {
  id: string;
  label: string;
  value: string;
  sourceType: "network_feed";
  sourceReference: string;
  observedAt: Date;
  sourceExcerptHash: string;
}

export interface GroundedClaim {
  claimKey: string;
  text: string;
  evidenceIds: string[];
}

export interface GroundedDraft {
  introduction: GroundedClaim[];
  sections: { heading: string; claims: GroundedClaim[] }[];
  cta: GroundedClaim;
}

export interface ContentValidationCheck {
  key: "factual_grounding" | "disclosure" | "prohibited_claims" | "near_duplicate" | "link_policy";
  label: string;
  result: string;
  status: "pass" | "warning" | "fail";
  details: Record<string, unknown>;
}

export interface ContentGenerationReservation {
  requestId: string;
  leaseToken: string;
  input: CreateContentDraft;
  productId: string;
  productName: string;
  facts: GroundingFact[];
}

export type ContentGenerationReservationResult =
  | { state: "reserved"; reservation: ContentGenerationReservation }
  | { state: "replayed"; response: ContentDraftResponse };

export class ContentGenerationIdempotencyConflictError extends Error {
  readonly code = "content_generation_idempotency_conflict";

  constructor() {
    super("The idempotency key has already been used with a different content brief");
    this.name = "ContentGenerationIdempotencyConflictError";
  }
}

export class ContentGenerationInProgressError extends Error {
  readonly code = "content_generation_in_progress";

  constructor(readonly retryAt: Date) {
    super("This content generation request is already in progress");
    this.name = "ContentGenerationInProgressError";
  }
}

export class OpportunityUnavailableError extends Error {
  readonly code = "opportunity_unavailable";

  constructor() {
    super("The opportunity is unavailable or no longer current");
    this.name = "OpportunityUnavailableError";
  }
}

export async function listRecentContentBodies(
  context: TenantContext,
  limit = 100,
): Promise<unknown[]> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const rows = await transaction
      .select({ body: contentRevisions.body })
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.organizationId, context.organizationId),
          eq(contentRevisions.workspaceId, context.workspaceId),
        ),
      )
      .orderBy(desc(contentRevisions.createdAt))
      .limit(Math.max(1, Math.min(limit, 200)));
    return rows.map((row) => row.body);
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sourceFields(sourcePayload: unknown): Record<string, unknown> {
  const raw = objectValue(sourcePayload);
  const basic = objectValue(raw.product_basic);
  if (Object.keys(basic).length === 0) return raw;
  return {
    ...basic,
    ...objectValue(raw.product_identifiers),
    ...objectValue(raw.product_description),
    ...objectValue(raw.product_category),
  };
}

function fact(
  id: string,
  label: string,
  value: unknown,
  sourceReference: string,
  observedAt: Date,
): GroundingFact | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim().slice(0, MAX_FACT_VALUE_LENGTH);
  if (!normalized) return null;
  return {
    id,
    label,
    value: normalized,
    sourceType: "network_feed",
    sourceReference,
    observedAt,
    sourceExcerptHash: createHash("sha256").update(`${id}:${normalized}`).digest("hex"),
  };
}

function buildGroundingFacts(product: {
  sourceProductId: string;
  name: string;
  merchantName: string;
  currency: string;
  price: string | null;
  available: boolean;
  observedAt: Date;
  sourcePayload: unknown;
}): GroundingFact[] {
  const raw = sourceFields(product.sourcePayload);
  const candidates = [
    fact("product.name", "Product name", product.name, product.sourceProductId, product.observedAt),
    fact(
      "merchant.name",
      "Merchant name",
      product.merchantName,
      product.sourceProductId,
      product.observedAt,
    ),
    fact(
      "product.price",
      "Observed price",
      product.price ? `${product.price} ${product.currency}` : null,
      product.sourceProductId,
      product.observedAt,
    ),
    fact(
      "product.availability",
      "Availability",
      product.available ? "available" : "unavailable",
      product.sourceProductId,
      product.observedAt,
    ),
    fact("product.brand", "Brand", raw.brand, product.sourceProductId, product.observedAt),
    fact(
      "product.description",
      "Merchant-supplied description",
      raw.description,
      product.sourceProductId,
      product.observedAt,
    ),
    fact(
      "product.identifier",
      "Product identifier",
      raw.gtin ?? raw.ean ?? raw.upc ?? raw.mpn,
      product.sourceProductId,
      product.observedAt,
    ),
    fact(
      "product.category",
      "Product category",
      raw.google_product_category ?? raw.product_type,
      product.sourceProductId,
      product.observedAt,
    ),
  ];
  return candidates.filter((candidate): candidate is GroundingFact => candidate !== null);
}

export async function reserveContentGeneration(
  context: TenantContext,
  input: CreateContentDraft,
  idempotencyKey: string,
  requestFingerprint: string,
  now = new Date(),
): Promise<ContentGenerationReservationResult> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${context.organizationId}:${idempotencyKey}`}, 0))`,
    );

    const [existing] = await transaction
      .select()
      .from(contentGenerationRequests)
      .where(
        and(
          eq(contentGenerationRequests.organizationId, context.organizationId),
          eq(contentGenerationRequests.workspaceId, context.workspaceId),
          eq(contentGenerationRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (existing && existing.requestFingerprint !== requestFingerprint) {
      throw new ContentGenerationIdempotencyConflictError();
    }
    if (existing?.status === "completed" && existing.result) {
      return {
        state: "replayed",
        response: contentDraftResponseSchema.parse({ ...existing.result, replayed: true }),
      };
    }
    if (
      existing?.status === "pending" &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt > now
    ) {
      throw new ContentGenerationInProgressError(existing.leaseExpiresAt);
    }

    const [opportunity] = await transaction
      .select({
        opportunityId: opportunities.id,
        productId: products.id,
        sourceProductId: products.sourceProductId,
        name: products.name,
        merchantName: products.merchantName,
        currency: products.currency,
        price: products.price,
        available: products.available,
        observedAt: products.observedAt,
        expiresAt: products.expiresAt,
        sourcePayload: products.sourcePayload,
      })
      .from(opportunities)
      .innerJoin(products, eq(opportunities.productId, products.id))
      .where(
        and(
          eq(opportunities.id, input.opportunityId),
          eq(opportunities.organizationId, context.organizationId),
          eq(opportunities.workspaceId, context.workspaceId),
          eq(products.organizationId, context.organizationId),
          eq(products.workspaceId, context.workspaceId),
          eq(products.available, true),
        ),
      )
      .limit(1);
    if (!opportunity || (opportunity.expiresAt && opportunity.expiresAt <= now)) {
      throw new OpportunityUnavailableError();
    }

    const leaseExpiresAt = new Date(now.getTime() + GENERATION_LEASE_MS);
    const leaseToken = randomUUID();
    let requestId: string;
    if (existing) {
      await transaction
        .update(contentGenerationRequests)
        .set({
          status: "pending",
          requestedByUserId: context.userId,
          leaseToken,
          leaseExpiresAt,
          lastErrorCode: null,
          updatedAt: now,
        })
        .where(eq(contentGenerationRequests.id, existing.id));
      requestId = existing.id;
    } else {
      const [created] = await transaction
        .insert(contentGenerationRequests)
        .values({
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          requestedByUserId: context.userId,
          idempotencyKey,
          requestFingerprint,
          leaseToken,
          leaseExpiresAt,
        })
        .returning({ id: contentGenerationRequests.id });
      if (!created) throw new Error("The content generation request could not be reserved");
      requestId = created.id;
    }

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "content.generation.started",
      targetType: "content_generation_request",
      targetId: requestId,
      details: {
        opportunityId: input.opportunityId,
        contentType: input.contentType,
        locale: input.locale,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      },
    });

    return {
      state: "reserved",
      reservation: {
        requestId,
        leaseToken,
        input,
        productId: opportunity.productId,
        productName: opportunity.name,
        facts: buildGroundingFacts(opportunity),
      },
    };
  });
}

function allClaims(draft: GroundedDraft): GroundedClaim[] {
  return [...draft.introduction, ...draft.sections.flatMap((section) => section.claims), draft.cta];
}

export async function completeContentGeneration(
  context: TenantContext,
  reservation: ContentGenerationReservation,
  draft: GroundedDraft,
  checks: ContentValidationCheck[],
  promptVersion: string,
  disclosure: { version: string; text: string },
  completedAt = new Date(),
): Promise<ContentDraftResponse> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [activeRequest] = await transaction
      .select({ id: contentGenerationRequests.id })
      .from(contentGenerationRequests)
      .where(
        and(
          eq(contentGenerationRequests.id, reservation.requestId),
          eq(contentGenerationRequests.organizationId, context.organizationId),
          eq(contentGenerationRequests.workspaceId, context.workspaceId),
          eq(contentGenerationRequests.status, "pending"),
          eq(contentGenerationRequests.leaseToken, reservation.leaseToken),
        ),
      )
      .for("update")
      .limit(1);
    if (!activeRequest) throw new ContentGenerationInProgressError(completedAt);

    const hasFailure = checks.some((check) => check.status === "fail");
    const status = hasFailure ? ("changes_requested" as const) : ("in_review" as const);
    const body = {
      version: "grounded-content-v1",
      disclosure: disclosure.text,
      introduction: draft.introduction,
      sections: draft.sections,
      cta: draft.cta,
    };
    const sourceSnapshot = {
      opportunityId: reservation.input.opportunityId,
      productId: reservation.productId,
      brief: {
        title: reservation.input.title,
        contentType: reservation.input.contentType,
        locale: reservation.input.locale,
        ...reservation.input.brief,
      },
      facts: reservation.facts.map((item) => ({
        ...item,
        observedAt: item.observedAt.toISOString(),
      })),
    };
    const checksum = createHash("sha256")
      .update(JSON.stringify({ body, sourceSnapshot, checks, promptVersion }))
      .digest("hex");

    const [contentItem] = await transaction
      .insert(contentItems)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        title: reservation.input.title,
        contentType: reservation.input.contentType,
        status,
        ownerUserId: context.userId,
      })
      .returning({ id: contentItems.id });
    if (!contentItem) throw new Error("The content item could not be created");

    const [revision] = await transaction
      .insert(contentRevisions)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        contentItemId: contentItem.id,
        revisionNumber: 1,
        body,
        disclosureVersion: disclosure.version,
        promptVersion,
        sourceSnapshot,
        validatorResults: { version: "mandatory-v1", checks },
        checksum,
        createdByUserId: context.userId,
      })
      .returning({ id: contentRevisions.id });
    if (!revision) throw new Error("The content revision could not be created");

    const factById = new Map(reservation.facts.map((item) => [item.id, item]));
    const evidence = allClaims(draft).flatMap((claim) =>
      [...new Set(claim.evidenceIds)].flatMap((evidenceId) => {
        const item = factById.get(evidenceId);
        if (!item) return [];
        return [
          {
            organizationId: context.organizationId,
            workspaceId: context.workspaceId,
            contentRevisionId: revision.id,
            claimKey: claim.claimKey,
            sourceType: item.sourceType,
            sourceReference: `${item.sourceReference}#${item.id}`,
            observedAt: item.observedAt,
            sourceExcerptHash: item.sourceExcerptHash,
          },
        ];
      }),
    );
    if (evidence.length > 0) await transaction.insert(evidenceRecords).values(evidence);

    await transaction
      .update(contentItems)
      .set({ currentRevisionId: revision.id, updatedAt: completedAt })
      .where(eq(contentItems.id, contentItem.id));

    const response = contentDraftResponseSchema.parse({
      contentId: contentItem.id,
      revisionId: revision.id,
      status,
      revision: 1,
      validationChecks: checks.map(({ details: _details, ...check }) => check),
      evidenceCount: evidence.length,
      promptVersion,
      generatedAt: completedAt.toISOString(),
      replayed: false,
    });

    await transaction
      .update(contentGenerationRequests)
      .set({
        status: "completed",
        contentItemId: contentItem.id,
        result: response,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(contentGenerationRequests.id, reservation.requestId),
          eq(contentGenerationRequests.organizationId, context.organizationId),
          eq(contentGenerationRequests.workspaceId, context.workspaceId),
          eq(contentGenerationRequests.leaseToken, reservation.leaseToken),
        ),
      );

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "content.generation.completed",
      targetType: "content_item",
      targetId: contentItem.id,
      details: {
        requestId: reservation.requestId,
        revisionId: revision.id,
        promptVersion,
        status,
        validation: checks.map((check) => ({ key: check.key, status: check.status })),
        evidenceCount: evidence.length,
      },
    });

    return response;
  });
}

export async function failContentGeneration(
  context: TenantContext,
  reservation: ContentGenerationReservation,
  errorCode: string,
  failedAt = new Date(),
): Promise<void> {
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [failedRequest] = await transaction
      .update(contentGenerationRequests)
      .set({
        status: "failed",
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: errorCode.slice(0, 120),
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(contentGenerationRequests.id, reservation.requestId),
          eq(contentGenerationRequests.organizationId, context.organizationId),
          eq(contentGenerationRequests.workspaceId, context.workspaceId),
          eq(contentGenerationRequests.leaseToken, reservation.leaseToken),
        ),
      )
      .returning({ id: contentGenerationRequests.id });
    if (!failedRequest) return;

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "content.generation.failed",
      targetType: "content_generation_request",
      targetId: reservation.requestId,
      details: {
        opportunityId: reservation.input.opportunityId,
        errorCode: errorCode.slice(0, 120),
      },
    });
  });
}
