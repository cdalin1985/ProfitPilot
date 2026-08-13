CREATE TYPE "billing_plan" AS ENUM ('starter', 'growth');
CREATE TYPE "billing_subscription_status" AS ENUM ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
CREATE TYPE "entitlement_key" AS ENUM ('private_beta_access', 'awin_import', 'content_generation', 'wordpress_draft', 'click_tracking', 'overview_metrics');
CREATE TYPE "entitlement_source" AS ENUM ('stripe', 'manual_beta_grant');

CREATE TABLE "billing_accounts" (
  "organization_id" uuid PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "billing_workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE restrict,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text,
  "stripe_price_id" text,
  "stripe_product_id" text,
  "plan" "billing_plan",
  "status" "billing_subscription_status",
  "current_period_end" timestamptz,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "last_stripe_event_created_at" timestamptz,
  "last_stripe_event_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "billing_accounts_stripe_customer_unique" ON "billing_accounts" ("stripe_customer_id");
CREATE UNIQUE INDEX "billing_accounts_stripe_subscription_unique" ON "billing_accounts" ("stripe_subscription_id");
CREATE INDEX "billing_accounts_workspace_idx" ON "billing_accounts" ("organization_id", "billing_workspace_id");

CREATE TABLE "billing_webhook_events" (
  "stripe_event_id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE restrict,
  "event_type" text NOT NULL,
  "event_created_at" timestamptz NOT NULL,
  "payload_sha256" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "processed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "billing_webhook_events_hash_check" CHECK ("payload_sha256" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "billing_webhook_events_tenant_time_idx" ON "billing_webhook_events" ("organization_id", "workspace_id", "event_created_at");

CREATE TABLE "organization_entitlements" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "key" "entitlement_key" NOT NULL,
  "source" "entitlement_source" NOT NULL,
  "source_reference" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "limit" integer,
  "effective_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "key", "source"),
  CONSTRAINT "organization_entitlements_limit_positive" CHECK ("limit" IS NULL OR "limit" > 0)
);
CREATE INDEX "organization_entitlements_effective_idx" ON "organization_entitlements" ("organization_id", "enabled", "expires_at");

ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_accounts_organization_access" ON "billing_accounts" FOR ALL
  USING ("organization_id" = app_private.current_organization_id())
  WITH CHECK (
    "organization_id" = app_private.current_organization_id()
    AND "billing_workspace_id" = app_private.current_workspace_id()
  );

ALTER TABLE "billing_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_webhook_events_tenant_read" ON "billing_webhook_events" FOR SELECT
  USING ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());
CREATE POLICY "billing_webhook_events_tenant_insert" ON "billing_webhook_events" FOR INSERT
  WITH CHECK ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());

ALTER TABLE "organization_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_entitlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organization_entitlements_organization_access" ON "organization_entitlements" FOR ALL
  USING ("organization_id" = app_private.current_organization_id())
  WITH CHECK ("organization_id" = app_private.current_organization_id());

REVOKE UPDATE, DELETE ON "billing_webhook_events" FROM profit_pilot_app;
