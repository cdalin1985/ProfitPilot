import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

import type {
  BillingContext,
  BillingPlan,
  BillingSubscriptionStatus,
  EffectiveEntitlement,
  EntitlementKey,
  TenantContext,
} from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  auditEvents,
  billingAccounts,
  billingWebhookEvents,
  organizationEntitlements,
} from "./schema.js";

export interface StripeEntitlementProjection {
  key: EntitlementKey;
  enabled: boolean;
  limit: number | null;
}

export interface StripeBillingSnapshot {
  eventId: string;
  eventType: string;
  eventCreatedAt: Date;
  organizationId: string;
  workspaceId: string;
  customerId: string;
  subscriptionId: string | null;
  priceId: string | null;
  productId: string | null;
  plan: BillingPlan | null;
  status: BillingSubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  entitlements: StripeEntitlementProjection[];
}

export interface StripeProjectionResult {
  replayed: boolean;
  applied: boolean;
}

export class BillingWebhookConflictError extends Error {
  readonly code = "billing_webhook_conflict";

  constructor() {
    super("The Stripe event identifier was reused with different content");
    this.name = "BillingWebhookConflictError";
  }
}

export class BillingAccountUnavailableError extends Error {
  readonly code = "billing_account_unavailable";

  constructor() {
    super("The organization does not have a projected Stripe customer");
    this.name = "BillingAccountUnavailableError";
  }
}

export class EntitlementDeniedError extends Error {
  readonly code = "entitlement_required";

  constructor(readonly entitlement: EntitlementKey) {
    super(`The organization is not entitled to ${entitlement}`);
    this.name = "EntitlementDeniedError";
  }
}

function isNewerEvent(
  eventCreatedAt: Date,
  eventId: string,
  lastCreatedAt: Date | null,
  lastEventId: string | null,
): boolean {
  if (!lastCreatedAt) return true;
  const timeDifference = eventCreatedAt.getTime() - lastCreatedAt.getTime();
  return timeDifference > 0 || (timeDifference === 0 && eventId > (lastEventId ?? ""));
}

export async function projectStripeBillingSnapshot(
  snapshot: StripeBillingSnapshot,
  payloadSha256: string,
): Promise<StripeProjectionResult> {
  return withTenant(snapshot.organizationId, snapshot.workspaceId, async (transaction) => {
    const [existingEvent] = await transaction
      .select({ payloadSha256: billingWebhookEvents.payloadSha256 })
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.stripeEventId, snapshot.eventId))
      .limit(1);
    if (existingEvent) {
      if (existingEvent.payloadSha256 !== payloadSha256) throw new BillingWebhookConflictError();
      return { replayed: true, applied: false };
    }

    const [account] = await transaction
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.organizationId, snapshot.organizationId))
      .limit(1)
      .for("update");
    const applied = isNewerEvent(
      snapshot.eventCreatedAt,
      snapshot.eventId,
      account?.lastStripeEventCreatedAt ?? null,
      account?.lastStripeEventId ?? null,
    );

    await transaction.insert(billingWebhookEvents).values({
      stripeEventId: snapshot.eventId,
      organizationId: snapshot.organizationId,
      workspaceId: snapshot.workspaceId,
      eventType: snapshot.eventType,
      eventCreatedAt: snapshot.eventCreatedAt,
      payloadSha256,
      snapshot: {
        customerId: snapshot.customerId,
        subscriptionId: snapshot.subscriptionId,
        priceId: snapshot.priceId,
        productId: snapshot.productId,
        plan: snapshot.plan,
        status: snapshot.status,
        currentPeriodEnd: snapshot.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      },
    });

    if (!applied) return { replayed: false, applied: false };

    await transaction
      .insert(billingAccounts)
      .values({
        organizationId: snapshot.organizationId,
        billingWorkspaceId: snapshot.workspaceId,
        stripeCustomerId: snapshot.customerId,
        stripeSubscriptionId: snapshot.subscriptionId,
        stripePriceId: snapshot.priceId,
        stripeProductId: snapshot.productId,
        plan: snapshot.plan,
        status: snapshot.status,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        lastStripeEventCreatedAt: snapshot.eventCreatedAt,
        lastStripeEventId: snapshot.eventId,
      })
      .onConflictDoUpdate({
        target: billingAccounts.organizationId,
        set: {
          billingWorkspaceId: snapshot.workspaceId,
          stripeCustomerId: snapshot.customerId,
          stripeSubscriptionId: snapshot.subscriptionId,
          stripePriceId: snapshot.priceId,
          stripeProductId: snapshot.productId,
          plan: snapshot.plan,
          status: snapshot.status,
          currentPeriodEnd: snapshot.currentPeriodEnd,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
          lastStripeEventCreatedAt: snapshot.eventCreatedAt,
          lastStripeEventId: snapshot.eventId,
          updatedAt: new Date(),
        },
      });

    if (snapshot.subscriptionId) {
      await transaction
        .update(organizationEntitlements)
        .set({ enabled: false, revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(organizationEntitlements.organizationId, snapshot.organizationId),
            eq(organizationEntitlements.source, "stripe"),
          ),
        );
      for (const entitlement of snapshot.entitlements) {
        await transaction
          .insert(organizationEntitlements)
          .values({
            organizationId: snapshot.organizationId,
            key: entitlement.key,
            source: "stripe",
            sourceReference: snapshot.subscriptionId,
            enabled: entitlement.enabled,
            limit: entitlement.limit,
            effectiveAt: snapshot.eventCreatedAt,
          })
          .onConflictDoUpdate({
            target: [
              organizationEntitlements.organizationId,
              organizationEntitlements.key,
              organizationEntitlements.source,
            ],
            set: {
              sourceReference: snapshot.subscriptionId,
              enabled: entitlement.enabled,
              limit: entitlement.limit,
              effectiveAt: snapshot.eventCreatedAt,
              expiresAt: null,
              revokedAt: null,
              updatedAt: new Date(),
            },
          });
      }
    }

    await transaction.insert(auditEvents).values({
      organizationId: snapshot.organizationId,
      workspaceId: snapshot.workspaceId,
      action: "billing.stripe_event.projected",
      targetType: "stripe_event",
      targetId: snapshot.eventId,
      details: {
        eventType: snapshot.eventType,
        status: snapshot.status,
        plan: snapshot.plan,
        subscriptionId: snapshot.subscriptionId,
      },
    });
    return { replayed: false, applied: true };
  });
}

export async function grantManualBetaEntitlements(
  context: TenantContext,
  keys: EntitlementKey[],
  sourceReference: string,
  expiresAt: Date,
): Promise<void> {
  if (expiresAt <= new Date()) throw new EntitlementDeniedError("private_beta_access");
  await withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    for (const key of [...new Set(keys)]) {
      await transaction
        .insert(organizationEntitlements)
        .values({
          organizationId: context.organizationId,
          key,
          source: "manual_beta_grant",
          sourceReference,
          enabled: true,
          effectiveAt: new Date(),
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            organizationEntitlements.organizationId,
            organizationEntitlements.key,
            organizationEntitlements.source,
          ],
          set: {
            sourceReference,
            enabled: true,
            effectiveAt: new Date(),
            expiresAt,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });
    }
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "billing.manual_beta_grant.created",
      targetType: "organization",
      targetId: context.organizationId,
      details: { keys: [...new Set(keys)], sourceReference, expiresAt: expiresAt.toISOString() },
    });
  });
}

async function listEffectiveEntitlements(
  context: TenantContext,
  now = new Date(),
): Promise<EffectiveEntitlement[]> {
  const rows = await withTenant(context.organizationId, context.workspaceId, (transaction) =>
    transaction
      .select()
      .from(organizationEntitlements)
      .where(
        and(
          eq(organizationEntitlements.organizationId, context.organizationId),
          eq(organizationEntitlements.enabled, true),
          lte(organizationEntitlements.effectiveAt, now),
          isNull(organizationEntitlements.revokedAt),
          or(
            isNull(organizationEntitlements.expiresAt),
            gt(organizationEntitlements.expiresAt, now),
          ),
        ),
      ),
  );
  const grouped = new Map<EntitlementKey, EffectiveEntitlement>();
  for (const row of rows) {
    const current = grouped.get(row.key);
    grouped.set(row.key, {
      key: row.key,
      enabled: true,
      limit: Math.max(current?.limit ?? 0, row.limit ?? 0) || null,
      expiresAt:
        !current?.expiresAt || !row.expiresAt
          ? null
          : new Date(current.expiresAt) > row.expiresAt
            ? current.expiresAt
            : row.expiresAt.toISOString(),
      sources: [...new Set([...(current?.sources ?? []), row.source])],
    });
  }
  return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export async function getBillingContext(context: TenantContext): Promise<BillingContext> {
  const [account, entitlements] = await Promise.all([
    withTenant(context.organizationId, context.workspaceId, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.organizationId, context.organizationId))
        .limit(1);
      return row;
    }),
    listEffectiveEntitlements(context),
  ]);
  return {
    organizationId: context.organizationId,
    customerId: account?.stripeCustomerId ?? null,
    subscriptionId: account?.stripeSubscriptionId ?? null,
    plan: account?.plan ?? null,
    status: account?.status ?? null,
    currentPeriodEnd: account?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false,
    entitlements,
  };
}

export async function assertEntitled(
  context: TenantContext,
  entitlement: EntitlementKey,
): Promise<EffectiveEntitlement> {
  const effective = (await listEffectiveEntitlements(context)).find(
    (candidate) => candidate.key === entitlement,
  );
  if (!effective) throw new EntitlementDeniedError(entitlement);
  return effective;
}

export async function requireBillingCustomer(context: TenantContext): Promise<string> {
  const billing = await getBillingContext(context);
  if (!billing.customerId) throw new BillingAccountUnavailableError();
  return billing.customerId;
}
