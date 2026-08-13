import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  wordpressDestinationSchema,
  wordpressDraftPublicationSchema,
  type ConfigureWordPressDestination,
  type TenantContext,
  type WordPressDestination,
  type WordPressDraftPublication,
} from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  auditEvents,
  contentItems,
  contentRevisions,
  publications,
  publishingDestinations,
} from "./schema.js";

const PUBLICATION_LEASE_MS = 5 * 60 * 1_000;

export class PublishingDestinationNotFoundError extends Error {
  readonly code = "publishing_destination_not_found";
  constructor() {
    super("The verified WordPress destination was not found");
    this.name = "PublishingDestinationNotFoundError";
  }
}

export class PublicationContentStateError extends Error {
  readonly code = "publication_content_state_conflict";
  constructor() {
    super("Only the current approved content revision can be published");
    this.name = "PublicationContentStateError";
  }
}

export class PublicationIdempotencyConflictError extends Error {
  readonly code = "publication_idempotency_conflict";
  constructor() {
    super("The idempotency key has already been used for a different publication");
    this.name = "PublicationIdempotencyConflictError";
  }
}

export class PublicationInProgressError extends Error {
  readonly code = "publication_in_progress";
  constructor(readonly retryAt: Date) {
    super("A WordPress draft publication is already in progress");
    this.name = "PublicationInProgressError";
  }
}

export class PublicationLeaseLostError extends Error {
  readonly code = "publication_lease_lost";
  constructor() {
    super("The WordPress publication lease is no longer current");
    this.name = "PublicationLeaseLostError";
  }
}

export interface WordPressPublicationReservation {
  replayed: false;
  publicationId: string;
  contentId: string;
  revisionId: string;
  destinationId: string;
  siteUrl: string;
  secretReference: string;
  title: string;
  body: unknown;
  remoteSlug: string;
  leaseToken: string;
}

export type ReserveWordPressPublicationResult =
  WordPressPublicationReservation | { replayed: true; publication: WordPressDraftPublication };

function requestFingerprint(input: {
  contentId: string;
  revisionId: string;
  destinationId: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function slugify(title: string, revisionId: string): string {
  const stem =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 56)
      .replace(/-$/g, "") || "profit-pilot-draft";
  return `${stem}-${revisionId.replaceAll("-", "").slice(0, 12)}`;
}

function replayedPublication(
  row: typeof publications.$inferSelect,
  contentId: string,
): WordPressDraftPublication | undefined {
  if (
    row.status !== "draft_created" ||
    !row.destinationId ||
    !row.remotePostId ||
    !row.remoteSlug ||
    !row.canonicalUrl
  ) {
    return undefined;
  }
  return wordpressDraftPublicationSchema.parse({
    publicationId: row.id,
    contentId,
    revisionId: row.contentRevisionId,
    destinationId: row.destinationId,
    status: "draft_created",
    remotePostId: row.remotePostId,
    remoteSlug: row.remoteSlug,
    remoteUrl: row.canonicalUrl,
    createdAt: row.updatedAt.toISOString(),
    replayed: true,
  });
}

export async function saveVerifiedWordPressDestination(
  context: TenantContext,
  input: ConfigureWordPressDestination & { siteUrl: string },
  verifiedAt: Date,
): Promise<WordPressDestination> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [destination] = await transaction
      .insert(publishingDestinations)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        name: input.name,
        type: "wordpress",
        baseUrl: input.siteUrl,
        secretReference: input.secretReference,
        status: "active",
        verifiedAt,
      })
      .onConflictDoUpdate({
        target: [
          publishingDestinations.organizationId,
          publishingDestinations.workspaceId,
          publishingDestinations.type,
          publishingDestinations.baseUrl,
        ],
        set: {
          name: input.name,
          secretReference: input.secretReference,
          status: "active",
          verifiedAt,
          updatedAt: verifiedAt,
        },
      })
      .returning();
    if (!destination) throw new Error("WordPress destination upsert returned no row");

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "destination.wordpress.verified",
      targetType: "publishing_destination",
      targetId: destination.id,
      details: { siteUrl: input.siteUrl },
      occurredAt: verifiedAt,
    });
    return wordpressDestinationSchema.parse({
      id: destination.id,
      type: "wordpress",
      name: destination.name,
      siteUrl: destination.baseUrl,
      status: "active",
      verifiedAt: verifiedAt.toISOString(),
    });
  });
}

export async function reserveWordPressPublication(
  context: TenantContext,
  input: { contentId: string; revisionId: string; destinationId: string },
  idempotencyKey: string,
): Promise<ReserveWordPressPublicationResult> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${context.organizationId}:${context.workspaceId}:${idempotencyKey}`}, 0))`,
    );
    const fingerprint = requestFingerprint(input);
    const [existing] = await transaction
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.organizationId, context.organizationId),
          eq(publications.workspaceId, context.workspaceId),
          eq(publications.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (
      existing &&
      (existing.requestFingerprint !== fingerprint ||
        existing.contentRevisionId !== input.revisionId ||
        existing.destinationId !== input.destinationId)
    ) {
      throw new PublicationIdempotencyConflictError();
    }
    const replay = existing ? replayedPublication(existing, input.contentId) : undefined;
    if (replay) return { replayed: true, publication: replay };

    const now = new Date();
    if (
      existing?.status === "creating_draft" &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt > now
    ) {
      throw new PublicationInProgressError(existing.leaseExpiresAt);
    }

    const [item] = await transaction
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.contentId),
          eq(contentItems.organizationId, context.organizationId),
          eq(contentItems.workspaceId, context.workspaceId),
        ),
      )
      .for("update")
      .limit(1);
    if (!item || item.status !== "approved" || item.currentRevisionId !== input.revisionId) {
      throw new PublicationContentStateError();
    }
    const [revision] = await transaction
      .select()
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.id, input.revisionId),
          eq(contentRevisions.contentItemId, item.id),
          eq(contentRevisions.organizationId, context.organizationId),
          eq(contentRevisions.workspaceId, context.workspaceId),
        ),
      )
      .limit(1);
    if (!revision) throw new PublicationContentStateError();
    const [destination] = await transaction
      .select()
      .from(publishingDestinations)
      .where(
        and(
          eq(publishingDestinations.id, input.destinationId),
          eq(publishingDestinations.organizationId, context.organizationId),
          eq(publishingDestinations.workspaceId, context.workspaceId),
          eq(publishingDestinations.type, "wordpress"),
          eq(publishingDestinations.status, "active"),
        ),
      )
      .limit(1);
    if (!destination?.verifiedAt) throw new PublishingDestinationNotFoundError();

    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + PUBLICATION_LEASE_MS);
    const remoteSlug = existing?.remoteSlug ?? slugify(item.title, revision.id);
    const [publication] = existing
      ? await transaction
          .update(publications)
          .set({
            status: "creating_draft",
            leaseToken,
            leaseExpiresAt,
            lastErrorCode: null,
            remoteSlug,
            updatedAt: now,
          })
          .where(eq(publications.id, existing.id))
          .returning()
      : await transaction
          .insert(publications)
          .values({
            organizationId: context.organizationId,
            workspaceId: context.workspaceId,
            contentRevisionId: revision.id,
            destinationType: "wordpress",
            destinationId: destination.id,
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: "creating_draft",
            remoteSlug,
            leaseToken,
            leaseExpiresAt,
          })
          .returning();
    if (!publication) throw new Error("WordPress publication reservation returned no row");
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "publication.wordpress.started",
      targetType: "publication",
      targetId: publication.id,
      details: { contentRevisionId: revision.id, destinationId: destination.id },
      occurredAt: now,
    });
    return {
      replayed: false,
      publicationId: publication.id,
      contentId: item.id,
      revisionId: revision.id,
      destinationId: destination.id,
      siteUrl: destination.baseUrl,
      secretReference: destination.secretReference,
      title: item.title,
      body: revision.body,
      remoteSlug,
      leaseToken,
    };
  });
}

export async function completeWordPressPublication(
  context: TenantContext,
  reservation: WordPressPublicationReservation,
  remote: { id: string; slug: string; url: string },
): Promise<WordPressDraftPublication> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const now = new Date();
    const [row] = await transaction
      .update(publications)
      .set({
        status: "draft_created",
        remotePostId: remote.id,
        remoteSlug: remote.slug,
        remoteStatus: "draft",
        canonicalUrl: remote.url,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(publications.id, reservation.publicationId),
          eq(publications.leaseToken, reservation.leaseToken),
          eq(publications.status, "creating_draft"),
        ),
      )
      .returning();
    if (!row) throw new PublicationLeaseLostError();
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "publication.wordpress.draft_created",
      targetType: "publication",
      targetId: row.id,
      details: { remotePostId: remote.id, remoteSlug: remote.slug },
      occurredAt: now,
    });
    return wordpressDraftPublicationSchema.parse({
      publicationId: row.id,
      contentId: reservation.contentId,
      revisionId: row.contentRevisionId,
      destinationId: reservation.destinationId,
      status: "draft_created",
      remotePostId: remote.id,
      remoteSlug: remote.slug,
      remoteUrl: remote.url,
      createdAt: now.toISOString(),
      replayed: false,
    });
  });
}

export async function failWordPressPublication(
  context: TenantContext,
  reservation: WordPressPublicationReservation,
  errorCode: string,
): Promise<void> {
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const now = new Date();
    const [row] = await transaction
      .update(publications)
      .set({
        status: "failed",
        lastErrorCode: errorCode.slice(0, 120),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(publications.id, reservation.publicationId),
          eq(publications.leaseToken, reservation.leaseToken),
          eq(publications.status, "creating_draft"),
        ),
      )
      .returning({ id: publications.id });
    if (!row) return;
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "publication.wordpress.failed",
      targetType: "publication",
      targetId: row.id,
      details: { errorCode: errorCode.slice(0, 120) },
      occurredAt: now,
    });
  });
}
