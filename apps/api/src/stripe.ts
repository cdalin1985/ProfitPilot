import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const STRIPE_API_VERSION = "2026-02-25.clover";

const hostedSessionSchema = z.object({ id: z.string().min(1), url: z.string().url() });

export interface StripeClient {
  createSubscriptionCheckout(
    secretKey: string,
    input: {
      priceId: string;
      organizationId: string;
      workspaceId: string;
      plan: string;
      successUrl: string;
      cancelUrl: string;
      idempotencyKey: string;
      customerId?: string;
    },
  ): Promise<{ id: string; url: string }>;
  createCustomerPortal(
    secretKey: string,
    input: { customerId: string; returnUrl: string; idempotencyKey: string },
  ): Promise<{ id: string; url: string }>;
}

export class StripeUnavailableError extends Error {
  readonly code = "stripe_unavailable";

  constructor() {
    super("Stripe could not complete the billing request");
    this.name = "StripeUnavailableError";
  }
}

export class StripeWebhookSignatureError extends Error {
  readonly code = "stripe_webhook_signature_invalid";

  constructor() {
    super("The Stripe webhook signature is invalid or expired");
    this.name = "StripeWebhookSignatureError";
  }
}

async function stripePost(
  secretKey: string,
  path: string,
  body: URLSearchParams,
  idempotencyKey: string,
): Promise<{ id: string; url: string }> {
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": idempotencyKey,
        "stripe-version": STRIPE_API_VERSION,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new StripeUnavailableError();
  }
  if (!response.ok) throw new StripeUnavailableError();
  try {
    return hostedSessionSchema.parse(await response.json());
  } catch {
    throw new StripeUnavailableError();
  }
}

export function createStripeClient(): StripeClient {
  return {
    createSubscriptionCheckout(secretKey, input) {
      const body = new URLSearchParams({
        mode: "subscription",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "line_items[0][price]": input.priceId,
        "line_items[0][quantity]": "1",
        client_reference_id: input.organizationId,
        "metadata[organization_id]": input.organizationId,
        "metadata[workspace_id]": input.workspaceId,
        "metadata[plan]": input.plan,
        "subscription_data[metadata][organization_id]": input.organizationId,
        "subscription_data[metadata][workspace_id]": input.workspaceId,
        "subscription_data[metadata][plan]": input.plan,
        allow_promotion_codes: "true",
      });
      if (input.customerId) body.set("customer", input.customerId);
      return stripePost(secretKey, "/v1/checkout/sessions", body, input.idempotencyKey);
    },
    createCustomerPortal(secretKey, input) {
      return stripePost(
        secretKey,
        "/v1/billing_portal/sessions",
        new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl }),
        input.idempotencyKey,
      );
    },
  };
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStripeWebhookSignature(
  payload: Buffer,
  signatureHeader: string,
  webhookSecret: string,
  now = new Date(),
): void {
  const fields = signatureHeader.split(",").map((field) => field.trim().split("=", 2));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    throw new StripeWebhookSignatureError();
  }
  const timestampSeconds = Number(timestamp);
  if (Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds) > 300) {
    throw new StripeWebhookSignatureError();
  }
  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  if (
    !signatures.some(
      (signature) => /^[a-f0-9]{64}$/.test(signature) && secureEqual(expected, signature),
    )
  ) {
    throw new StripeWebhookSignatureError();
  }
}
