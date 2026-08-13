import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { ClickEventEnvelope, ClickEventResult, TenantContext } from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import { affiliateLinks, auditEvents, clickEvents, contentItems, contentRevisions, products } from "./schema.js";

export class AffiliateLinkNotFoundError extends Error {
  readonly code = "affiliate_link_not_found";
  constructor() { super("The affiliate link was not found"); this.name = "AffiliateLinkNotFoundError"; }
}
export class AffiliateLinkStateError extends Error {
  readonly code = "affiliate_link_state_conflict";
  constructor() { super("Only the current approved revision can create an affiliate link"); this.name = "AffiliateLinkStateError"; }
}
export class AffiliateLinkIdempotencyConflictError extends Error {
  readonly code = "affiliate_link_idempotency_conflict";
  constructor() { super("The idempotency key was used for different affiliate-link input"); this.name = "AffiliateLinkIdempotencyConflictError"; }
}

export interface AffiliateLinkRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  contentId: string;
  revisionId: string;
  productId: string;
  destinationUrl: string;
  signingKeyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replayed: boolean;
}

function object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
function productIdFromSnapshot(input: unknown): string | undefined {
  const value = object(input).productId;
  return typeof value === "string" ? value : undefined;
}
function destinationFromPayload(input: unknown): URL {
  const raw = object(input);
  const basic = object(raw.product_basic);
  const value = basic.link ?? raw.link;
  if (typeof value !== "string" || value.length > 4_096 || /[\r\n\0]/.test(value)) throw new AffiliateLinkStateError();
  let url: URL;
  try { url = new URL(value); } catch { throw new AffiliateLinkStateError(); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !hostname.includes(".") || hostname === "localhost" || isIP(hostname) !== 0) throw new AffiliateLinkStateError();
  url.hostname = hostname;
  url.hash = "";
  return url;
}
function fingerprint(input: object): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }

export async function createAffiliateLink(
  context: TenantContext,
  input: { contentId: string; revisionId: string; expiresInDays: number; signingKeyId: string },
  idempotencyKey: string,
  now = new Date(),
): Promise<AffiliateLinkRecord> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const requestFingerprint = fingerprint(input);
    const [existing] = await transaction.select().from(affiliateLinks).where(and(
      eq(affiliateLinks.organizationId, context.organizationId),
      eq(affiliateLinks.workspaceId, context.workspaceId),
      eq(affiliateLinks.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new AffiliateLinkIdempotencyConflictError();
      return { ...existing, contentId: input.contentId, revisionId: existing.contentRevisionId, replayed: true };
    }
    const [revision] = await transaction.select({
      revisionId: contentRevisions.id,
      sourceSnapshot: contentRevisions.sourceSnapshot,
      contentId: contentItems.id,
      currentRevisionId: contentItems.currentRevisionId,
      status: contentItems.status,
    }).from(contentRevisions).innerJoin(contentItems, eq(contentItems.id, contentRevisions.contentItemId)).where(and(
      eq(contentRevisions.id, input.revisionId), eq(contentItems.id, input.contentId),
      eq(contentItems.organizationId, context.organizationId), eq(contentItems.workspaceId, context.workspaceId),
    )).limit(1);
    if (!revision || revision.status !== "approved" || revision.currentRevisionId !== revision.revisionId) throw new AffiliateLinkStateError();
    const productId = productIdFromSnapshot(revision.sourceSnapshot);
    if (!productId) throw new AffiliateLinkStateError();
    const [product] = await transaction.select({ id: products.id, sourcePayload: products.sourcePayload, available: products.available }).from(products).where(and(
      eq(products.id, productId), eq(products.organizationId, context.organizationId), eq(products.workspaceId, context.workspaceId), eq(products.available, true),
    )).limit(1);
    if (!product) throw new AffiliateLinkStateError();
    const destination = destinationFromPayload(product.sourcePayload);
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
    const [created] = await transaction.insert(affiliateLinks).values({
      organizationId: context.organizationId, workspaceId: context.workspaceId,
      contentRevisionId: revision.revisionId, productId: product.id,
      destinationUrl: destination.toString(), destinationUrlHash: createHash("sha256").update(destination.toString()).digest("hex"),
      destinationHost: destination.hostname.toLowerCase(), signingKeyId: input.signingKeyId,
      expiresAt, idempotencyKey, requestFingerprint,
    }).returning();
    if (!created) throw new Error("Affiliate link could not be created");
    await transaction.insert(auditEvents).values({ organizationId: context.organizationId, workspaceId: context.workspaceId, actorUserId: context.userId, action: "affiliate_link.created", targetType: "affiliate_link", targetId: created.id, details: { contentId: input.contentId, revisionId: input.revisionId, productId: product.id, signingKeyId: input.signingKeyId, expiresAt: expiresAt.toISOString() } });
    return { ...created, contentId: input.contentId, revisionId: created.contentRevisionId, replayed: false };
  });
}

export async function revokeAffiliateLink(context: TenantContext, linkId: string, now = new Date()): Promise<void> {
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [updated] = await transaction.update(affiliateLinks).set({ revokedAt: now, updatedAt: now }).where(and(eq(affiliateLinks.id, linkId), eq(affiliateLinks.organizationId, context.organizationId), eq(affiliateLinks.workspaceId, context.workspaceId))).returning({ id: affiliateLinks.id });
    if (!updated) throw new AffiliateLinkNotFoundError();
    await transaction.insert(auditEvents).values({ organizationId: context.organizationId, workspaceId: context.workspaceId, actorUserId: context.userId, action: "affiliate_link.revoked", targetType: "affiliate_link", targetId: linkId, details: { revokedAt: now.toISOString() } });
  });
}

export async function resolveAffiliateLink(input: { organizationId: string; workspaceId: string; linkId: string; signingKeyId: string }, now = new Date()): Promise<AffiliateLinkRecord> {
  const [row] = await withTenant(input.organizationId, input.workspaceId, (transaction) => transaction.select({
    id: affiliateLinks.id, organizationId: affiliateLinks.organizationId, workspaceId: affiliateLinks.workspaceId,
    contentId: contentItems.id, revisionId: affiliateLinks.contentRevisionId, productId: affiliateLinks.productId,
    destinationUrl: affiliateLinks.destinationUrl, signingKeyId: affiliateLinks.signingKeyId,
    expiresAt: affiliateLinks.expiresAt, revokedAt: affiliateLinks.revokedAt,
  }).from(affiliateLinks).innerJoin(contentRevisions, eq(contentRevisions.id, affiliateLinks.contentRevisionId)).innerJoin(contentItems, eq(contentItems.id, contentRevisions.contentItemId)).where(and(
    eq(affiliateLinks.id, input.linkId), eq(affiliateLinks.organizationId, input.organizationId), eq(affiliateLinks.workspaceId, input.workspaceId), eq(affiliateLinks.signingKeyId, input.signingKeyId),
  )).limit(1));
  if (!row || row.revokedAt || row.expiresAt <= now) throw new AffiliateLinkNotFoundError();
  return { ...row, replayed: false };
}

export async function ingestClickEvent(envelope: ClickEventEnvelope, now = new Date()): Promise<ClickEventResult> {
  return withTenant(envelope.organizationId, envelope.workspaceId, async (transaction) => {
    const [existing] = await transaction.select().from(clickEvents).where(eq(clickEvents.id, envelope.eventId)).limit(1);
    const requestFingerprint = fingerprint(envelope);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new AffiliateLinkIdempotencyConflictError();
      return { eventId: existing.id, classification: existing.classification, reasonCode: existing.reasonCode, replayed: true };
    }
    const [link] = await transaction.select({ id: affiliateLinks.id }).from(affiliateLinks).where(and(eq(affiliateLinks.id, envelope.linkId), eq(affiliateLinks.organizationId, envelope.organizationId), eq(affiliateLinks.workspaceId, envelope.workspaceId))).limit(1);
    if (!link) throw new AffiliateLinkNotFoundError();
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${envelope.linkId}:${envelope.visitorHash}`}, 0))`);
    let classification: "qualified" | "bot" | "duplicate" = envelope.botReason ? "bot" : "qualified";
    let reasonCode = envelope.botReason ?? "first_human_click";
    if (!envelope.botReason) {
      const cutoff = new Date(now.getTime() - 30 * 60_000);
      const [prior] = await transaction.select({ id: clickEvents.id }).from(clickEvents).where(and(eq(clickEvents.affiliateLinkId, envelope.linkId), eq(clickEvents.visitorHash, envelope.visitorHash), eq(clickEvents.classification, "qualified"), gte(clickEvents.receivedAt, cutoff))).orderBy(desc(clickEvents.receivedAt)).limit(1);
      if (prior) { classification = "duplicate"; reasonCode = "visitor_window_30m"; }
    }
    await transaction.insert(clickEvents).values({ id: envelope.eventId, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, affiliateLinkId: envelope.linkId, occurredAt: new Date(envelope.occurredAt), visitorHash: envelope.visitorHash, privacyKeyId: envelope.privacyKeyId, userAgentClass: envelope.userAgentClass, classification, reasonCode, requestFingerprint });
    return { eventId: envelope.eventId, classification, reasonCode, replayed: false };
  });
}
