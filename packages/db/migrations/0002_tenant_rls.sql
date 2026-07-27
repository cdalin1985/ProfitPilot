CREATE SCHEMA IF NOT EXISTS "app_private";--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_organization_id"()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_workspace_id"()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
$$;--> statement-breakpoint

REVOKE CREATE ON SCHEMA "app_private" FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "app_private" TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_organization_id"() TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_workspace_id"() TO PUBLIC;--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organizations_tenant_access" ON "organizations"
  FOR ALL
  USING ("id" = "app_private"."current_organization_id"())
  WITH CHECK ("id" = "app_private"."current_organization_id"());--> statement-breakpoint

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspaces_tenant_access" ON "workspaces"
  FOR ALL
  USING ("organization_id" = "app_private"."current_organization_id"())
  WITH CHECK ("organization_id" = "app_private"."current_organization_id"());--> statement-breakpoint

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_tenant_access" ON "memberships"
  FOR ALL
  USING ("organization_id" = "app_private"."current_organization_id"())
  WITH CHECK ("organization_id" = "app_private"."current_organization_id"());--> statement-breakpoint

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_tenant_read" ON "users"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "memberships"
      WHERE "memberships"."user_id" = "users"."id"
        AND "memberships"."organization_id" = "app_private"."current_organization_id"()
    )
  );--> statement-breakpoint

ALTER TABLE "affiliate_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affiliate_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "affiliate_connections_tenant_access" ON "affiliate_connections"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_tenant_access" ON "products"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opportunities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "opportunities_tenant_access" ON "opportunities"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_items_tenant_access" ON "content_items"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_revisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_revisions_tenant_access" ON "content_revisions"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "evidence_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "evidence_records_tenant_access" ON "evidence_records"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "publications_tenant_access" ON "publications"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_events_tenant_read" ON "audit_events"
  FOR SELECT
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND (
      "workspace_id" IS NULL
      OR "workspace_id" = "app_private"."current_workspace_id"()
    )
  );--> statement-breakpoint
CREATE POLICY "audit_events_tenant_append" ON "audit_events"
  FOR INSERT
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND (
      "workspace_id" IS NULL
      OR "workspace_id" = "app_private"."current_workspace_id"()
    )
  );
