import { and, asc, eq, gt, like, sql } from "drizzle-orm";

import type { TenantContext } from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  affiliateConnections,
  auditEvents,
  feedSyncStates,
  opportunities,
  products,
} from "./schema.js";

const FRESHNESS_WINDOW_MS = 15 * 60 * 1_000;
const SYNC_LEASE_MS = 20 * 60 * 1_000;
const FAILURE_RETRY_MS = 60 * 1_000;
const PRODUCT_BATCH_SIZE = 500;
const CONNECTION_REQUESTS_PER_MINUTE = 4;

export interface AwinFeedIdentity {
  connectionId: string;
  publisherId: number;
  advertiserId: number;
  locale: string;
}

export interface FeedSyncReservation extends AwinFeedIdentity {
  id: string;
  secretReference: string;
  sourceEtag?: string;
  sourceLastModifiedAt?: Date;
}

export interface NormalizedProductOpportunity {
  sourceProductId: string;
  canonicalKey: string;
  name: string;
  merchantName: string;
  currency: string;
  price: string | null;
  commissionRate: string | null;
  available: boolean;
  observedAt: Date;
  expiresAt: Date | null;
  sourcePayload: Record<string, unknown>;
  opportunity: {
    score: number;
    scoreVersion: string;
    explanation: Record<string, unknown>;
    inputSnapshot: Record<string, unknown>;
  };
}

export interface FeedSyncCompletion {
  received: number;
  rejected: number;
  sourceEtag?: string;
  sourceLastModifiedAt?: Date;
  completedAt: Date;
}

export class AffiliateConnectionUnavailableError extends Error {
  readonly code = "affiliate_connection_unavailable";

  constructor() {
    super("The Awin connection is not active in this workspace");
    this.name = "AffiliateConnectionUnavailableError";
  }
}

export class FeedSyncInProgressError extends Error {
  readonly code = "feed_sync_in_progress";

  constructor(readonly retryAt: Date) {
    super("This Awin feed is already being synchronized");
    this.name = "FeedSyncInProgressError";
  }
}

export class FeedSyncFreshnessError extends Error {
  readonly code = "feed_sync_freshness_window";

  constructor(readonly retryAt: Date) {
    super("This Awin feed was synchronized recently");
    this.name = "FeedSyncFreshnessError";
  }
}

export class FeedSyncQuotaError extends Error {
  readonly code = "feed_sync_quota";

  constructor(readonly retryAt: Date) {
    super("The Awin connection has reached its product-feed request quota");
    this.name = "FeedSyncQuotaError";
  }
}

function sourcePredicate(context: TenantContext, input: AwinFeedIdentity) {
  return and(
    eq(feedSyncStates.organizationId, context.organizationId),
    eq(feedSyncStates.workspaceId, context.workspaceId),
    eq(feedSyncStates.connectionId, input.connectionId),
    eq(feedSyncStates.publisherId, input.publisherId),
    eq(feedSyncStates.advertiserId, input.advertiserId),
    eq(feedSyncStates.locale, input.locale),
  );
}

export async function reserveAwinFeedSync(
  context: TenantContext,
  input: AwinFeedIdentity,
  now = new Date(),
): Promise<FeedSyncReservation> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [connection] = await transaction
      .select({
        id: affiliateConnections.id,
        secretReference: affiliateConnections.secretReference,
      })
      .from(affiliateConnections)
      .where(
        and(
          eq(affiliateConnections.id, input.connectionId),
          eq(affiliateConnections.organizationId, context.organizationId),
          eq(affiliateConnections.workspaceId, context.workspaceId),
          eq(affiliateConnections.provider, "awin"),
          eq(affiliateConnections.status, "active"),
        ),
      )
      .limit(1);
    if (!connection) {
      throw new AffiliateConnectionUnavailableError();
    }

    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))`,
    );
    const quotaWindowStartedAt = new Date(now.getTime() - 60 * 1_000);
    const recentStarts = await transaction
      .select({ lastStartedAt: feedSyncStates.lastStartedAt })
      .from(feedSyncStates)
      .where(
        and(
          eq(feedSyncStates.organizationId, context.organizationId),
          eq(feedSyncStates.workspaceId, context.workspaceId),
          eq(feedSyncStates.connectionId, input.connectionId),
          gt(feedSyncStates.lastStartedAt, quotaWindowStartedAt),
        ),
      )
      .orderBy(asc(feedSyncStates.lastStartedAt))
      .limit(CONNECTION_REQUESTS_PER_MINUTE);
    if (recentStarts.length >= CONNECTION_REQUESTS_PER_MINUTE) {
      throw new FeedSyncQuotaError(
        new Date((recentStarts[0]?.lastStartedAt ?? now).getTime() + 60 * 1_000),
      );
    }

    await transaction
      .insert(feedSyncStates)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        connectionId: input.connectionId,
        publisherId: input.publisherId,
        advertiserId: input.advertiserId,
        locale: input.locale,
      })
      .onConflictDoNothing();

    const [state] = await transaction
      .select()
      .from(feedSyncStates)
      .where(sourcePredicate(context, input))
      .for("update")
      .limit(1);
    if (!state) {
      throw new Error("The feed synchronization state could not be reserved");
    }

    if (state.status === "running" && state.leaseExpiresAt && state.leaseExpiresAt > now) {
      throw new FeedSyncInProgressError(state.leaseExpiresAt);
    }
    if (state.nextEligibleAt && state.nextEligibleAt > now) {
      throw new FeedSyncFreshnessError(state.nextEligibleAt);
    }

    const leaseExpiresAt = new Date(now.getTime() + SYNC_LEASE_MS);
    await transaction
      .update(feedSyncStates)
      .set({
        status: "running",
        lastStartedAt: now,
        leaseExpiresAt,
        lastErrorCode: null,
        updatedAt: now,
      })
      .where(eq(feedSyncStates.id, state.id));

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "awin.feed_sync.started",
      targetType: "feed_sync",
      targetId: state.id,
      details: {
        connectionId: input.connectionId,
        publisherId: input.publisherId,
        advertiserId: input.advertiserId,
        locale: input.locale,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      },
    });

    return {
      ...input,
      id: state.id,
      secretReference: connection.secretReference,
      ...(state.sourceEtag ? { sourceEtag: state.sourceEtag } : {}),
      ...(state.sourceLastModifiedAt ? { sourceLastModifiedAt: state.sourceLastModifiedAt } : {}),
    };
  });
}

export async function completeUnmodifiedFeedSync(
  context: TenantContext,
  reservation: FeedSyncReservation,
  completedAt = new Date(),
): Promise<Date> {
  const nextEligibleAt = new Date(completedAt.getTime() + FRESHNESS_WINDOW_MS);
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction
      .update(feedSyncStates)
      .set({
        status: "not_modified",
        lastCompletedAt: completedAt,
        nextEligibleAt,
        leaseExpiresAt: null,
        lastErrorCode: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(feedSyncStates.id, reservation.id),
          eq(feedSyncStates.organizationId, context.organizationId),
          eq(feedSyncStates.workspaceId, context.workspaceId),
        ),
      );

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "awin.feed_sync.not_modified",
      targetType: "feed_sync",
      targetId: reservation.id,
      details: {
        connectionId: reservation.connectionId,
        publisherId: reservation.publisherId,
        advertiserId: reservation.advertiserId,
        locale: reservation.locale,
        nextEligibleAt: nextEligibleAt.toISOString(),
      },
    });
  });
  return nextEligibleAt;
}

export async function completeAwinFeedSync(
  context: TenantContext,
  reservation: FeedSyncReservation,
  normalizedProducts: NormalizedProductOpportunity[],
  completion: FeedSyncCompletion,
): Promise<Date> {
  const nextEligibleAt = new Date(completion.completedAt.getTime() + FRESHNESS_WINDOW_MS);

  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction
      .update(products)
      .set({ available: false, updatedAt: completion.completedAt })
      .where(
        and(
          eq(products.organizationId, context.organizationId),
          eq(products.workspaceId, context.workspaceId),
          eq(products.connectionId, reservation.connectionId),
          like(products.sourceProductId, `awin:${reservation.advertiserId}:%`),
        ),
      );

    for (let offset = 0; offset < normalizedProducts.length; offset += PRODUCT_BATCH_SIZE) {
      const batch = normalizedProducts.slice(offset, offset + PRODUCT_BATCH_SIZE);
      const persisted = await transaction
        .insert(products)
        .values(
          batch.map((product) => ({
            organizationId: context.organizationId,
            workspaceId: context.workspaceId,
            connectionId: reservation.connectionId,
            sourceProductId: product.sourceProductId,
            canonicalKey: product.canonicalKey,
            name: product.name,
            merchantName: product.merchantName,
            currency: product.currency,
            price: product.price,
            commissionRate: product.commissionRate,
            available: product.available,
            observedAt: product.observedAt,
            expiresAt: product.expiresAt,
            sourcePayload: product.sourcePayload,
            updatedAt: completion.completedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [products.workspaceId, products.connectionId, products.sourceProductId],
          set: {
            canonicalKey: sql`excluded.canonical_key`,
            name: sql`excluded.name`,
            merchantName: sql`excluded.merchant_name`,
            currency: sql`excluded.currency`,
            price: sql`excluded.price`,
            commissionRate: sql`excluded.commission_rate`,
            available: sql`excluded.available`,
            observedAt: sql`excluded.observed_at`,
            expiresAt: sql`excluded.expires_at`,
            sourcePayload: sql`excluded.source_payload`,
            updatedAt: completion.completedAt,
          },
        })
        .returning({ id: products.id, sourceProductId: products.sourceProductId });

      const productBySourceId = new Map(batch.map((product) => [product.sourceProductId, product]));
      if (persisted.length > 0) {
        await transaction
          .insert(opportunities)
          .values(
            persisted.map((row) => {
              const product = productBySourceId.get(row.sourceProductId);
              if (!product) {
                throw new Error("The persisted product could not be matched to its score");
              }
              return {
                organizationId: context.organizationId,
                workspaceId: context.workspaceId,
                productId: row.id,
                score: product.opportunity.score,
                scoreVersion: product.opportunity.scoreVersion,
                explanation: product.opportunity.explanation,
                inputSnapshot: product.opportunity.inputSnapshot,
                scoredAt: completion.completedAt,
              };
            }),
          )
          .onConflictDoNothing();
      }
    }

    await transaction
      .update(feedSyncStates)
      .set({
        status: "succeeded",
        sourceEtag: completion.sourceEtag ?? null,
        sourceLastModifiedAt: completion.sourceLastModifiedAt ?? null,
        lastCompletedAt: completion.completedAt,
        nextEligibleAt,
        leaseExpiresAt: null,
        lastProductCount: normalizedProducts.length,
        lastRejectedCount: completion.rejected,
        lastErrorCode: null,
        updatedAt: completion.completedAt,
      })
      .where(
        and(
          eq(feedSyncStates.id, reservation.id),
          eq(feedSyncStates.organizationId, context.organizationId),
          eq(feedSyncStates.workspaceId, context.workspaceId),
        ),
      );

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "awin.feed_sync.succeeded",
      targetType: "feed_sync",
      targetId: reservation.id,
      details: {
        connectionId: reservation.connectionId,
        publisherId: reservation.publisherId,
        advertiserId: reservation.advertiserId,
        locale: reservation.locale,
        received: completion.received,
        accepted: normalizedProducts.length,
        rejected: completion.rejected,
        nextEligibleAt: nextEligibleAt.toISOString(),
      },
    });
  });

  return nextEligibleAt;
}

export async function failAwinFeedSync(
  context: TenantContext,
  reservation: FeedSyncReservation,
  errorCode: string,
  failedAt = new Date(),
): Promise<void> {
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    await transaction
      .update(feedSyncStates)
      .set({
        status: "failed",
        nextEligibleAt: new Date(failedAt.getTime() + FAILURE_RETRY_MS),
        leaseExpiresAt: null,
        lastErrorCode: errorCode.slice(0, 120),
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(feedSyncStates.id, reservation.id),
          eq(feedSyncStates.organizationId, context.organizationId),
          eq(feedSyncStates.workspaceId, context.workspaceId),
        ),
      );

    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "awin.feed_sync.failed",
      targetType: "feed_sync",
      targetId: reservation.id,
      details: {
        connectionId: reservation.connectionId,
        publisherId: reservation.publisherId,
        advertiserId: reservation.advertiserId,
        locale: reservation.locale,
        errorCode: errorCode.slice(0, 120),
        retryAt: new Date(failedAt.getTime() + FAILURE_RETRY_MS).toISOString(),
      },
    });
  });
}
