import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  contentReviewActionResponseSchema,
  contentReviewSchema,
  validationCheckSchema,
  type ApproveContentRevision,
  type ContentReview,
  type ContentReviewActionResponse,
  type RequestContentChanges,
  type TenantContext,
} from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  auditEvents,
  contentItems,
  contentReviewActions,
  contentRevisions,
  evidenceRecords,
  users,
} from "./schema.js";

const mandatoryValidatorKeys = new Set([
  "factual_grounding",
  "disclosure",
  "prohibited_claims",
  "near_duplicate",
  "link_policy",
]);

export class ContentReviewNotFoundError extends Error {
  readonly code = "content_review_not_found";
  constructor() {
    super("The content item or its current revision was not found");
    this.name = "ContentReviewNotFoundError";
  }
}

export class StaleContentRevisionError extends Error {
  readonly code = "stale_content_revision";
  constructor() {
    super("The content revision is no longer current");
    this.name = "StaleContentRevisionError";
  }
}

export class ContentReviewStateError extends Error {
  readonly code = "content_review_state_conflict";
  constructor(readonly status: string) {
    super(`Content in ${status} state cannot accept this review action`);
    this.name = "ContentReviewStateError";
  }
}

export class ContentApprovalBlockedError extends Error {
  readonly code = "content_approval_blocked";
  constructor() {
    super("Approval requires every mandatory validation check to be present and non-failing");
    this.name = "ContentApprovalBlockedError";
  }
}

export class ContentReviewIdempotencyConflictError extends Error {
  readonly code = "content_review_idempotency_conflict";
  constructor() {
    super("The idempotency key has already been used for a different review action");
    this.name = "ContentReviewIdempotencyConflictError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function checks(value: unknown) {
  const parsed = record(value).checks;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((check) => {
    const result = validationCheckSchema.safeParse(check);
    return result.success ? [result.data] : [];
  });
}

export function mandatoryValidationPasses(value: unknown): boolean {
  const parsed = checks(value);
  return (
    parsed.length >= mandatoryValidatorKeys.size &&
    [...mandatoryValidatorKeys].every((key) =>
      parsed.some((check) => check.key === key && check.status !== "fail"),
    )
  );
}

function claimText(value: unknown): string {
  return String(record(value).text ?? "").trim();
}

function reviewFromRows(
  item: typeof contentItems.$inferSelect,
  revision: typeof contentRevisions.$inferSelect,
  evidence: (typeof evidenceRecords.$inferSelect)[],
  latestAction: typeof contentReviewActions.$inferSelect | undefined,
  ownerName: string | undefined,
): ContentReview {
  const body = record(revision.body);
  const source = record(revision.sourceSnapshot);
  const brief = record(source.brief);
  const facts = Array.isArray(source.facts) ? source.facts.map(record) : [];
  const introductionClaims = Array.isArray(body.introduction) ? body.introduction : [];
  const firstClaim = introductionClaims[0];
  const introduction = introductionClaims.map(claimText).filter(Boolean).join(" ");
  const productName = String(
    facts.find((fact) => fact.id === "product.name")?.value ?? "Unknown product",
  );
  const provider = String(facts.find((fact) => fact.id === "affiliate.network")?.value ?? "");
  const network = provider
    ? provider
        .split("_")
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ")
    : "Affiliate network";
  const requiredChanges = Array.isArray(latestAction?.requiredChanges)
    ? latestAction.requiredChanges.length
    : 0;

  return contentReviewSchema.parse({
    id: item.id,
    revisionId: revision.id,
    title: item.title,
    status: item.status,
    revision: revision.revisionNumber,
    owner: ownerName ?? "Unassigned",
    locale: String(brief.locale ?? "en-US"),
    productName,
    network,
    destination: "Not configured",
    disclosure: String(body.disclosure ?? "Disclosure unavailable"),
    introduction: introduction || "Draft introduction unavailable",
    selectedClaim: claimText(firstClaim) || "No claim selected",
    validationChecks: checks(revision.validatorResults),
    evidence: evidence.map((row) => ({
      id: row.id,
      label: row.sourceReference,
      sourceType: row.sourceType,
      observedAt: row.observedAt.toISOString(),
      ...(URL.canParse(row.sourceReference) ? { sourceUrl: row.sourceReference } : {}),
    })),
    unresolvedComments: item.status === "changes_requested" ? Math.max(1, requiredChanges) : 0,
  });
}

export async function getContentReview(
  context: TenantContext,
  contentId: string,
): Promise<ContentReview | undefined> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [item] = await transaction
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, contentId),
          eq(contentItems.organizationId, context.organizationId),
          eq(contentItems.workspaceId, context.workspaceId),
        ),
      )
      .limit(1);
    if (!item?.currentRevisionId) return undefined;

    const [revision] = await transaction
      .select()
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.id, item.currentRevisionId),
          eq(contentRevisions.organizationId, context.organizationId),
          eq(contentRevisions.workspaceId, context.workspaceId),
        ),
      )
      .limit(1);
    if (!revision) return undefined;

    const evidence = await transaction
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.contentRevisionId, revision.id))
      .orderBy(evidenceRecords.createdAt);
    const [latestAction] = await transaction
      .select()
      .from(contentReviewActions)
      .where(eq(contentReviewActions.contentItemId, item.id))
      .orderBy(desc(contentReviewActions.createdAt))
      .limit(1);
    const [owner] = item.ownerUserId
      ? await transaction
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, item.ownerUserId))
          .limit(1)
      : [];
    return reviewFromRows(item, revision, evidence, latestAction, owner?.displayName);
  });
}

type ReviewInput =
  | { action: "changes_requested"; payload: RequestContentChanges }
  | { action: "approved"; payload: ApproveContentRevision };

function fingerprint(input: ReviewInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function recordReviewAction(
  context: TenantContext,
  contentId: string,
  input: ReviewInput,
  idempotencyKey: string,
): Promise<ContentReviewActionResponse> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${context.organizationId}:${context.workspaceId}:${idempotencyKey}`}, 0))`,
    );
    const requestFingerprint = fingerprint(input);
    const [existing] = await transaction
      .select()
      .from(contentReviewActions)
      .where(
        and(
          eq(contentReviewActions.organizationId, context.organizationId),
          eq(contentReviewActions.workspaceId, context.workspaceId),
          eq(contentReviewActions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.requestFingerprint !== requestFingerprint ||
        existing.contentItemId !== contentId ||
        existing.contentRevisionId !== input.payload.revisionId ||
        existing.action !== input.action
      ) {
        throw new ContentReviewIdempotencyConflictError();
      }
      return contentReviewActionResponseSchema.parse({
        contentId,
        revisionId: existing.contentRevisionId,
        actionId: existing.id,
        action: existing.action,
        status: existing.action,
        actedAt: existing.createdAt.toISOString(),
        replayed: true,
      });
    }

    const [item] = await transaction
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, contentId),
          eq(contentItems.organizationId, context.organizationId),
          eq(contentItems.workspaceId, context.workspaceId),
        ),
      )
      .for("update")
      .limit(1);
    if (!item?.currentRevisionId) throw new ContentReviewNotFoundError();
    if (item.currentRevisionId !== input.payload.revisionId) throw new StaleContentRevisionError();
    if (item.status !== "in_review") throw new ContentReviewStateError(item.status);

    const [revision] = await transaction
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.id, item.currentRevisionId))
      .limit(1);
    if (!revision) throw new ContentReviewNotFoundError();
    if (input.action === "approved" && !mandatoryValidationPasses(revision.validatorResults)) {
      throw new ContentApprovalBlockedError();
    }

    const now = new Date();
    const requiredChanges =
      input.action === "changes_requested" ? input.payload.requiredChanges : [];
    const comment =
      input.action === "changes_requested" ? input.payload.summary : input.payload.note;
    const [action] = await transaction
      .insert(contentReviewActions)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        contentItemId: item.id,
        contentRevisionId: revision.id,
        actorUserId: context.userId,
        action: input.action,
        comment,
        requiredChanges,
        validatorSnapshot: revision.validatorResults,
        requestFingerprint,
        idempotencyKey,
        createdAt: now,
      })
      .returning();
    if (!action) throw new Error("Review action insert did not return a row");

    await transaction
      .update(contentItems)
      .set({ status: input.action, updatedAt: now })
      .where(eq(contentItems.id, item.id));
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: `content.review.${input.action}`,
      targetType: "content_revision",
      targetId: revision.id,
      details: {
        contentItemId: item.id,
        reviewActionId: action.id,
        idempotencyKey,
        requiredChangeCount: requiredChanges.length,
      },
    });

    return contentReviewActionResponseSchema.parse({
      contentId: item.id,
      revisionId: revision.id,
      actionId: action.id,
      action: input.action,
      status: input.action,
      actedAt: now.toISOString(),
      replayed: false,
    });
  });
}

export function requestContentChanges(
  context: TenantContext,
  contentId: string,
  input: RequestContentChanges,
  idempotencyKey: string,
): Promise<ContentReviewActionResponse> {
  return recordReviewAction(
    context,
    contentId,
    { action: "changes_requested", payload: input },
    idempotencyKey,
  );
}

export function approveContentRevision(
  context: TenantContext,
  contentId: string,
  input: ApproveContentRevision,
  idempotencyKey: string,
): Promise<ContentReviewActionResponse> {
  return recordReviewAction(
    context,
    contentId,
    { action: "approved", payload: input },
    idempotencyKey,
  );
}
