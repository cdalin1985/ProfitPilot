import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StripeWebhookSignatureError, verifyStripeWebhookSignature } from "./stripe.js";

describe("Stripe webhook signatures", () => {
  it("accepts a current v1 signature and rejects tampering and stale deliveries", () => {
    const payload = Buffer.from('{"id":"evt_test"}');
    const secret = "whsec_test0123456789";
    const now = new Date("2026-08-13T12:00:00.000Z");
    const timestamp = Math.floor(now.getTime() / 1_000);
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload.toString("utf8")}`)
      .digest("hex");

    expect(() =>
      verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${signature}`, secret, now),
    ).not.toThrow();
    expect(() =>
      verifyStripeWebhookSignature(
        Buffer.from("tampered"),
        `t=${timestamp},v1=${signature}`,
        secret,
        now,
      ),
    ).toThrow(StripeWebhookSignatureError);
    expect(() =>
      verifyStripeWebhookSignature(payload, `t=${timestamp - 301},v1=${signature}`, secret, now),
    ).toThrow(StripeWebhookSignatureError);
  });
});
