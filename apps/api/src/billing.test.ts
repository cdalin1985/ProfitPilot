import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@profit-pilot/contracts";

import { createBillingService } from "./billing.js";
import { loadConfig } from "./config.js";

const context: TenantContext = {
  organizationId: "018f6d4d-74d4-7c18-a1d4-bb620a63b001",
  workspaceId: "018f6d4d-74d4-7c18-a1d4-bb620a63b002",
  userId: "018f6d4d-74d4-7c18-a1d4-bb620a63b003",
  organizationRole: "owner",
  workspaceRole: "workspace_admin",
};

const config = loadConfig({
  NODE_ENV: "test",
  AUTH_MODE: "development",
  STRIPE_CREDENTIALS_SECRET_REFERENCE: "profit-pilot/test/stripe",
  STRIPE_STARTER_PRICE_ID: "price_starter123",
  STRIPE_GROWTH_PRICE_ID: "price_growth123",
  STRIPE_CHECKOUT_SUCCESS_URL: "https://app.example.test/billing?checkout=success",
  STRIPE_CHECKOUT_CANCEL_URL: "https://app.example.test/billing?checkout=cancelled",
  STRIPE_PORTAL_RETURN_URL: "https://app.example.test/billing",
});

describe("billing service", () => {
  it("creates hosted subscription Checkout with server-controlled price and tenant metadata", async () => {
    const createSubscriptionCheckout = vi.fn(async () => ({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }));
    const service = createBillingService(
      config,
      {
        async resolveCredentials() {
          return { secretKey: "sk_test_0123456789", webhookSecret: "whsec_0123456789" };
        },
      },
      {
        createSubscriptionCheckout,
        async createCustomerPortal() {
          return { id: "bps_test", url: "https://billing.stripe.com/p/session/test" };
        },
      },
      {
        async getContext() {
          return {
            organizationId: context.organizationId,
            customerId: null,
            subscriptionId: null,
            plan: null,
            status: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            entitlements: [],
          };
        },
        async requireCustomer() {
          return "cus_test";
        },
        async project() {
          return { replayed: false, applied: true };
        },
      },
    );

    await expect(
      service.createCheckout(context, { plan: "starter" }, "018f6d4d-74d4-7c18-a1d4-bb620a63b004"),
    ).resolves.toEqual({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    expect(createSubscriptionCheckout).toHaveBeenCalledWith(
      "sk_test_0123456789",
      expect.objectContaining({
        priceId: "price_starter123",
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        idempotencyKey: `${context.organizationId}:018f6d4d-74d4-7c18-a1d4-bb620a63b004`,
      }),
    );
  });

  it("verifies the exact raw webhook body before any parsing", async () => {
    const payload = Buffer.from(
      '{"id":"evt_ignored","type":"ping","created":1786644000,"data":{"object":{}}}',
    );
    const timestamp = Math.floor(Date.now() / 1_000);
    const secret = "whsec_0123456789";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload.toString("utf8")}`)
      .digest("hex");
    const service = createBillingService(
      config,
      {
        async resolveCredentials() {
          return { secretKey: "sk_test_0123456789", webhookSecret: secret };
        },
      },
      {
        async createSubscriptionCheckout() {
          throw new Error("unused");
        },
        async createCustomerPortal() {
          throw new Error("unused");
        },
      },
      {
        async getContext() {
          throw new Error("unused");
        },
        async requireCustomer() {
          throw new Error("unused");
        },
        async project() {
          throw new Error("unused");
        },
      },
    );

    await expect(service.handleWebhook(payload, `t=${timestamp},v1=${signature}`)).resolves.toEqual(
      {
        received: true,
        replayed: false,
        applied: false,
        ignored: true,
      },
    );
  });
});
