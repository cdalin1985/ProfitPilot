import { createHash } from "node:crypto";

import { z } from "zod";

import {
  billingContextSchema,
  billingPlanSchema,
  billingSubscriptionStatusSchema,
  type BillingContext,
  type BillingPlan,
  type CreateCheckoutSession,
  type EntitlementKey,
  type HostedBillingSession,
  type TenantContext,
} from "@profit-pilot/contracts";
import {
  assertEntitled as assertDatabaseEntitled,
  getBillingContext,
  projectStripeBillingSnapshot,
  requireBillingCustomer,
  type StripeBillingSnapshot,
  type StripeEntitlementProjection,
} from "@profit-pilot/db";

import type { ApiConfig } from "./config.js";
import type { StripeCredentialResolver } from "./secrets.js";
import { createStripeClient, type StripeClient, verifyStripeWebhookSignature } from "./stripe.js";

const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().positive(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

const subscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
  status: billingSubscriptionStatusSchema,
  cancel_at_period_end: z.boolean().default(false),
  current_period_end: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.string()),
  items: z.object({
    data: z
      .array(
        z.object({
          current_period_end: z.number().int().positive().optional(),
          price: z.object({
            id: z.string().min(1),
            product: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
          }),
        }),
      )
      .min(1),
  }),
});

const enabledStatuses = new Set(["active", "trialing"]);
const planEntitlements: Readonly<Record<BillingPlan, readonly [EntitlementKey, number | null][]>> =
  {
    starter: [
      ["awin_import", 4],
      ["content_generation", 100],
      ["wordpress_draft", null],
      ["click_tracking", null],
      ["overview_metrics", null],
    ],
    growth: [
      ["awin_import", 20],
      ["content_generation", 1_000],
      ["wordpress_draft", null],
      ["click_tracking", null],
      ["overview_metrics", null],
    ],
  };

export interface BillingService {
  createCheckout(
    context: TenantContext,
    input: CreateCheckoutSession,
    idempotencyKey: string,
  ): Promise<HostedBillingSession>;
  createPortal(context: TenantContext, idempotencyKey: string): Promise<HostedBillingSession>;
  getContext(context: TenantContext): Promise<BillingContext>;
  handleWebhook(
    payload: Buffer,
    signatureHeader: string,
  ): Promise<{ received: true; replayed: boolean; applied: boolean; ignored: boolean }>;
}

export interface BillingRepository {
  getContext(context: TenantContext): Promise<BillingContext>;
  requireCustomer(context: TenantContext): Promise<string>;
  project(
    snapshot: StripeBillingSnapshot,
    payloadSha256: string,
  ): Promise<{ replayed: boolean; applied: boolean }>;
}

export interface EntitlementService {
  assert(context: TenantContext, entitlement: EntitlementKey): Promise<void>;
}

export function createEntitlementService(config: ApiConfig): EntitlementService {
  return {
    async assert(context, entitlement) {
      if (!config.DATABASE_URL && config.NODE_ENV !== "production") return;
      await assertDatabaseEntitled(context, entitlement);
    },
  };
}

export class BillingConfigurationError extends Error {
  readonly code = "billing_not_configured";

  constructor() {
    super("Stripe billing is not configured for this environment");
    this.name = "BillingConfigurationError";
  }
}

export class BillingStateConflictError extends Error {
  readonly code = "billing_state_conflict";

  constructor() {
    super("Manage the existing subscription through Customer Portal");
    this.name = "BillingStateConflictError";
  }
}

function configuration(config: ApiConfig): {
  secretReference: string;
  prices: Record<BillingPlan, string>;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  portalReturnUrl: string;
} {
  if (
    !config.STRIPE_CREDENTIALS_SECRET_REFERENCE ||
    !config.STRIPE_STARTER_PRICE_ID ||
    !config.STRIPE_GROWTH_PRICE_ID ||
    !config.STRIPE_CHECKOUT_SUCCESS_URL ||
    !config.STRIPE_CHECKOUT_CANCEL_URL ||
    !config.STRIPE_PORTAL_RETURN_URL
  ) {
    throw new BillingConfigurationError();
  }
  return {
    secretReference: config.STRIPE_CREDENTIALS_SECRET_REFERENCE,
    prices: { starter: config.STRIPE_STARTER_PRICE_ID, growth: config.STRIPE_GROWTH_PRICE_ID },
    checkoutSuccessUrl: config.STRIPE_CHECKOUT_SUCCESS_URL,
    checkoutCancelUrl: config.STRIPE_CHECKOUT_CANCEL_URL,
    portalReturnUrl: config.STRIPE_PORTAL_RETURN_URL,
  };
}

function identifier(value: unknown): string {
  if (typeof value === "string") return value;
  return z.object({ id: z.string().min(1) }).parse(value).id;
}

function subscriptionSnapshot(
  payload: Buffer,
  config: ReturnType<typeof configuration>,
): StripeBillingSnapshot | undefined {
  const event = stripeEventSchema.parse(JSON.parse(payload.toString("utf8")));
  if (!event.type.startsWith("customer.subscription.")) return undefined;
  const subscription = subscriptionSchema.parse(event.data.object);
  const organizationId = z.string().uuid().parse(subscription.metadata.organization_id);
  const workspaceId = z.string().uuid().parse(subscription.metadata.workspace_id);
  const item = subscription.items.data[0]!;
  const planEntry = Object.entries(config.prices).find(([, priceId]) => priceId === item.price.id);
  const plan = planEntry ? billingPlanSchema.parse(planEntry[0]) : null;
  const enabled = enabledStatuses.has(subscription.status) && plan !== null;
  const entitlements: StripeEntitlementProjection[] = plan
    ? planEntitlements[plan].map(([key, limit]) => ({ key, enabled, limit }))
    : [];
  const periodEnd = subscription.current_period_end ?? item.current_period_end;
  return {
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt: new Date(event.created * 1_000),
    organizationId,
    workspaceId,
    customerId: identifier(subscription.customer),
    subscriptionId: subscription.id,
    priceId: item.price.id,
    productId: identifier(item.price.product),
    plan,
    status: subscription.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1_000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    entitlements,
  };
}

export function createBillingService(
  config: ApiConfig,
  credentialResolver: StripeCredentialResolver,
  stripeClient: StripeClient = createStripeClient(),
  repository: BillingRepository = {
    getContext: getBillingContext,
    requireCustomer: requireBillingCustomer,
    project: projectStripeBillingSnapshot,
  },
): BillingService {
  return {
    async createCheckout(context, input, idempotencyKey) {
      const configured = configuration(config);
      const [credentials, billing] = await Promise.all([
        credentialResolver.resolveCredentials(configured.secretReference),
        repository.getContext(context),
      ]);
      if (
        billing.subscriptionId &&
        !["canceled", "incomplete_expired"].includes(billing.status ?? "")
      ) {
        throw new BillingStateConflictError();
      }
      return stripeClient.createSubscriptionCheckout(credentials.secretKey, {
        priceId: configured.prices[input.plan],
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        plan: input.plan,
        successUrl: configured.checkoutSuccessUrl,
        cancelUrl: configured.checkoutCancelUrl,
        idempotencyKey: `${context.organizationId}:${idempotencyKey}`,
        ...(billing.customerId ? { customerId: billing.customerId } : {}),
      });
    },
    async createPortal(context, idempotencyKey) {
      const configured = configuration(config);
      const [credentials, customerId] = await Promise.all([
        credentialResolver.resolveCredentials(configured.secretReference),
        repository.requireCustomer(context),
      ]);
      return stripeClient.createCustomerPortal(credentials.secretKey, {
        customerId,
        returnUrl: configured.portalReturnUrl,
        idempotencyKey: `${context.organizationId}:${idempotencyKey}`,
      });
    },
    async getContext(context) {
      return billingContextSchema.parse(await repository.getContext(context));
    },
    async handleWebhook(payload, signatureHeader) {
      const configured = configuration(config);
      const credentials = await credentialResolver.resolveCredentials(configured.secretReference);
      verifyStripeWebhookSignature(payload, signatureHeader, credentials.webhookSecret);
      const snapshot = subscriptionSnapshot(payload, configured);
      if (!snapshot) {
        return { received: true, replayed: false, applied: false, ignored: true };
      }
      const result = await repository.project(
        snapshot,
        createHash("sha256").update(payload).digest("hex"),
      );
      return { received: true, ...result, ignored: false };
    },
  };
}
