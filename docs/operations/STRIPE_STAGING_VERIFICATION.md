# Stripe staging verification

PP-111 uses Stripe-hosted subscription Checkout and Customer Portal. Signed webhooks are the only
source of subscription truth; browser redirects never grant access.

## Account gate

An authorized owner must create Stripe test products/prices, configure Customer Portal policy, and
store one JSON secret in AWS Secrets Manager:

```json
{ "secretKey": "sk_test_...", "webhookSecret": "whsec_..." }
```

Configure `STRIPE_CREDENTIALS_SECRET_REFERENCE`, `STRIPE_STARTER_PRICE_ID`,
`STRIPE_GROWTH_PRICE_ID`, and the three HTTPS return URLs. The API pins Stripe API version
`2026-02-25.clover`. Do not put secret values in environment variables, logs, tickets, or source.

## Staging contract

1. Apply migration `0010_stripe_billing_entitlements` with the migration role.
2. Confirm forced RLS on `billing_accounts`, `billing_webhook_events`, and
   `organization_entitlements`; a second tenant must see zero rows.
3. As an organization owner, create Checkout using a UUID `Idempotency-Key`. Verify the response is
   an HTTPS Stripe URL and the selected price came from server configuration, never request input.
4. Complete Checkout with a Stripe test card. Confirm the signed `customer.subscription.*` event is
   stored once with its SHA-256 and sanitized subscription snapshot.
5. Replay the exact event: it must return replayed without changing projection. Replay its ID with a
   different body: it must return conflict. Deliver an older event after a newer event: preserve the
   newer projection while retaining the inbox record.
6. Confirm only `active` and `trialing` project enabled Stripe entitlements. Exercise `past_due`,
   `unpaid`, `paused`, `canceled`, and `incomplete_expired`; protected API and worker operations must
   deny them immediately.
7. Open Customer Portal and return to the configured HTTPS URL. Portal redirects do not mutate the
   local projection before a valid webhook arrives.
8. Create an expiring `manual_beta_grant` through the approved internal operator procedure. Verify it
   combines with Stripe grants through the same resolver and expires/revokes without fabricated
   Stripe rows.

## Required negative checks

- invalid, stale, or missing `Stripe-Signature` is rejected before JSON parsing;
- malformed metadata, unrecognized price, or cross-tenant workspace binding fails closed;
- customer IDs and event snapshots are never accepted from the browser;
- unauthorized workspace roles cannot create Checkout/Portal sessions or read billing context;
- secret-resolution and Stripe errors expose no keys, signatures, payloads, or provider bodies;
- `awin_import`, `content_generation`, `wordpress_draft`, `click_tracking`, and `overview_metrics`
  are enforced server-side, not only hidden in the UI.

Record test event IDs, request IDs, projected status, entitlement keys, migration ID, build digest,
and pass/fail results. Do not record raw webhook bodies or credentials.
