CREATE TYPE "click_classification" AS ENUM ('qualified', 'bot', 'duplicate');
CREATE TABLE "affiliate_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "content_revision_id" uuid NOT NULL REFERENCES "content_revisions"("id") ON DELETE restrict,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE restrict,
  "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null,
  "destination_url" text NOT NULL,
  "destination_url_hash" text NOT NULL,
  "destination_host" text NOT NULL,
  "signing_key_id" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "affiliate_links_https_check" CHECK ("destination_url" LIKE 'https://%')
);
CREATE UNIQUE INDEX "affiliate_links_idempotency_unique" ON "affiliate_links" ("organization_id", "workspace_id", "idempotency_key");
CREATE INDEX "affiliate_links_revision_product_idx" ON "affiliate_links" ("content_revision_id", "product_id");
CREATE INDEX "affiliate_links_tenant_expiry_idx" ON "affiliate_links" ("organization_id", "workspace_id", "expires_at");
CREATE TABLE "click_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "affiliate_link_id" uuid NOT NULL REFERENCES "affiliate_links"("id") ON DELETE cascade,
  "occurred_at" timestamptz NOT NULL,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "visitor_hash" text NOT NULL,
  "privacy_key_id" text NOT NULL,
  "user_agent_class" text NOT NULL,
  "classification" "click_classification" NOT NULL,
  "reason_code" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  CONSTRAINT "click_events_visitor_hash_check" CHECK ("visitor_hash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "click_events_tenant_time_idx" ON "click_events" ("organization_id", "workspace_id", "received_at");
CREATE INDEX "click_events_link_visitor_time_idx" ON "click_events" ("affiliate_link_id", "visitor_hash", "received_at");
ALTER TABLE "affiliate_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_links_tenant_access" ON "affiliate_links" FOR ALL
  USING ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id())
  WITH CHECK ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());
ALTER TABLE "click_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "click_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "click_events_tenant_read" ON "click_events" FOR SELECT
  USING ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());
CREATE POLICY "click_events_tenant_insert" ON "click_events" FOR INSERT
  WITH CHECK ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());
