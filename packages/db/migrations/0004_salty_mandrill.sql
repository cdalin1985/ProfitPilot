CREATE TYPE "public"."membership_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."onboarding_request_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('workspace_profile', 'publishing_destination', 'affiliate_connection', 'brand_policy', 'sample_import', 'evidence_backed_draft', 'destination_draft', 'destination_verification', 'workspace_activation');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step_state" AS ENUM('pending', 'in_progress', 'blocked', 'completed');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'archived', 'pending_deletion');--> statement-breakpoint
CREATE TYPE "public"."workspace_membership_role" AS ENUM('workspace_admin', 'strategist', 'editor', 'contributor', 'analyst', 'client_approver', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('setup', 'active', 'suspended', 'archived');--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "organizations")
    OR EXISTS (SELECT 1 FROM "workspaces")
    OR EXISTS (SELECT 1 FROM "memberships")
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PP-101 migration stopped: existing tenant data requires an explicit WorkOS identity-linking and workspace-profile backfill before this migration can run';
  END IF;
END
$$;--> statement-breakpoint
ALTER TYPE "public"."membership_role" RENAME TO "membership_role_legacy";--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM(
  'owner',
  'admin',
  'editor',
  'analyst',
  'client_approver',
  'viewer',
  'organization_admin',
  'billing_admin',
  'member'
);--> statement-breakpoint
ALTER TABLE "memberships"
  ALTER COLUMN "role" TYPE "public"."membership_role"
  USING "role"::text::"public"."membership_role";--> statement-breakpoint
DROP TYPE "public"."membership_role_legacy";--> statement-breakpoint
CREATE TABLE "onboarding_requests" (
	"idempotency_key" uuid PRIMARY KEY NOT NULL,
	"external_identity_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"identity_provider_organization_id" text,
	"identity_provider_membership_id" text,
	"status" "onboarding_request_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_requests_attempt_count_nonnegative" CHECK ("onboarding_requests"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_onboarding_steps" (
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"step" "onboarding_step" NOT NULL,
	"position" integer NOT NULL,
	"state" "onboarding_step_state" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"blocked_reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_onboarding_steps_workspace_id_step_pk" PRIMARY KEY("workspace_id","step"),
	CONSTRAINT "workspace_onboarding_position_positive" CHECK ("workspace_onboarding_steps"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "identity_provider_membership_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "status" "membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "identity_provider_organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status" "organization_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_picture_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_authenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "target_country" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "default_language" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "niche" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "status" "workspace_status" DEFAULT 'setup' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_onboarding_steps" ADD CONSTRAINT "workspace_onboarding_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_onboarding_steps" ADD CONSTRAINT "workspace_onboarding_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_requests_actor_time_idx" ON "onboarding_requests" USING btree ("external_identity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_requests_organization_unique" ON "onboarding_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_requests_workspace_unique" ON "onboarding_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_organization_user_idx" ON "workspace_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_onboarding_position_unique" ON "workspace_onboarding_steps" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "workspace_onboarding_tenant_idx" ON "workspace_onboarding_steps" USING btree ("organization_id","workspace_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_identity_provider_unique" ON "memberships" USING btree ("identity_provider_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_identity_provider_unique" ON "organizations" USING btree ("identity_provider_organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_role_check" CHECK ("memberships"."role" in ('owner', 'organization_admin', 'billing_admin', 'member'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_target_country_check" CHECK ("workspaces"."target_country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_default_language_check" CHECK ("workspaces"."default_language" ~ '^[a-z]{2,3}$');--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_actor_external_id"()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_actor_external_id', true), '')
$$;--> statement-breakpoint

ALTER TABLE "onboarding_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_requests_actor_read" ON "onboarding_requests"
  FOR SELECT
  USING (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint
CREATE POLICY "onboarding_requests_actor_insert" ON "onboarding_requests"
  FOR INSERT
  WITH CHECK (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint
CREATE POLICY "onboarding_requests_actor_update" ON "onboarding_requests"
  FOR UPDATE
  USING (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  )
  WITH CHECK (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint

CREATE POLICY "users_actor_read" ON "users"
  FOR SELECT
  USING (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint
CREATE POLICY "users_actor_insert" ON "users"
  FOR INSERT
  WITH CHECK (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint
CREATE POLICY "users_actor_update" ON "users"
  FOR UPDATE
  USING (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  )
  WITH CHECK (
    "external_identity_id" = "app_private"."current_actor_external_id"()
  );--> statement-breakpoint

ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_memberships_tenant_read" ON "workspace_memberships"
  FOR SELECT
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND (
      "workspace_id" = "app_private"."current_workspace_id"()
      OR EXISTS (
        SELECT 1
        FROM "users"
        WHERE "users"."id" = "workspace_memberships"."user_id"
          AND "users"."external_identity_id" = "app_private"."current_actor_external_id"()
      )
    )
  );--> statement-breakpoint
CREATE POLICY "workspace_memberships_tenant_insert" ON "workspace_memberships"
  FOR INSERT
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint
CREATE POLICY "workspace_memberships_tenant_update" ON "workspace_memberships"
  FOR UPDATE
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint
CREATE POLICY "workspace_memberships_tenant_delete" ON "workspace_memberships"
  FOR DELETE
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

ALTER TABLE "workspace_onboarding_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_onboarding_steps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_onboarding_steps_tenant_access" ON "workspace_onboarding_steps"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."resolve_tenant"(
  requested_external_identity_id text,
  requested_identity_provider_organization_id text,
  requested_workspace_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  workspace_id uuid,
  user_id uuid,
  organization_role text,
  workspace_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    organization_record.id,
    workspace_record.id,
    user_record.id,
    CASE membership_record.role::text
      WHEN 'admin' THEN 'organization_admin'
      WHEN 'editor' THEN 'member'
      WHEN 'analyst' THEN 'member'
      WHEN 'client_approver' THEN 'member'
      WHEN 'viewer' THEN 'member'
      ELSE membership_record.role::text
    END,
    workspace_membership_record.role::text
  FROM public.users AS user_record
  INNER JOIN public.memberships AS membership_record
    ON membership_record.user_id = user_record.id
    AND membership_record.status = 'active'
  INNER JOIN public.organizations AS organization_record
    ON organization_record.id = membership_record.organization_id
    AND organization_record.status = 'active'
    AND organization_record.identity_provider_organization_id =
      requested_identity_provider_organization_id
  INNER JOIN public.workspaces AS workspace_record
    ON workspace_record.organization_id = organization_record.id
    AND workspace_record.id = requested_workspace_id
    AND workspace_record.status IN ('setup', 'active')
  LEFT JOIN public.workspace_memberships AS workspace_membership_record
    ON workspace_membership_record.organization_id = organization_record.id
    AND workspace_membership_record.workspace_id = workspace_record.id
    AND workspace_membership_record.user_id = user_record.id
    AND workspace_membership_record.status = 'active'
  WHERE requested_external_identity_id =
      NULLIF(current_setting('app.current_actor_external_id', true), '')
    AND user_record.external_identity_id = requested_external_identity_id
    AND user_record.disabled = false
    AND (
      membership_record.role::text IN ('owner', 'admin', 'organization_admin')
      OR workspace_membership_record.user_id IS NOT NULL
    )
  LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."list_actor_organizations"(
  requested_external_identity_id text
)
RETURNS TABLE (
  id uuid,
  identity_provider_organization_id text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    organization_record.id,
    organization_record.identity_provider_organization_id,
    organization_record.name
  FROM public.users AS user_record
  INNER JOIN public.memberships AS membership_record
    ON membership_record.user_id = user_record.id
    AND membership_record.status = 'active'
  INNER JOIN public.organizations AS organization_record
    ON organization_record.id = membership_record.organization_id
    AND organization_record.status = 'active'
  WHERE requested_external_identity_id =
      NULLIF(current_setting('app.current_actor_external_id', true), '')
    AND user_record.external_identity_id = requested_external_identity_id
    AND user_record.disabled = false
  ORDER BY organization_record.name, organization_record.id
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."list_actor_workspaces"(
  requested_external_identity_id text,
  requested_identity_provider_organization_id text
)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    organization_record.id,
    organization_record.name,
    workspace_record.id,
    workspace_record.name,
    workspace_record.slug,
    workspace_record.status::text
  FROM public.users AS user_record
  INNER JOIN public.memberships AS membership_record
    ON membership_record.user_id = user_record.id
    AND membership_record.status = 'active'
  INNER JOIN public.organizations AS organization_record
    ON organization_record.id = membership_record.organization_id
    AND organization_record.status = 'active'
    AND organization_record.identity_provider_organization_id =
      requested_identity_provider_organization_id
  INNER JOIN public.workspaces AS workspace_record
    ON workspace_record.organization_id = organization_record.id
    AND workspace_record.status <> 'archived'
  LEFT JOIN public.workspace_memberships AS workspace_membership_record
    ON workspace_membership_record.organization_id = organization_record.id
    AND workspace_membership_record.workspace_id = workspace_record.id
    AND workspace_membership_record.user_id = user_record.id
    AND workspace_membership_record.status = 'active'
  WHERE requested_external_identity_id =
      NULLIF(current_setting('app.current_actor_external_id', true), '')
    AND user_record.external_identity_id = requested_external_identity_id
    AND user_record.disabled = false
    AND (
      membership_record.role::text IN ('owner', 'admin', 'organization_admin')
      OR workspace_membership_record.user_id IS NOT NULL
    )
  ORDER BY workspace_record.name, workspace_record.id
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "app_private"."resolve_tenant"(text, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."list_actor_organizations"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."list_actor_workspaces"(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_actor_external_id"() TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."resolve_tenant"(text, text, uuid) TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."list_actor_organizations"(text) TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."list_actor_workspaces"(text, text) TO PUBLIC;
