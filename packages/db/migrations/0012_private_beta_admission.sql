CREATE TYPE "beta_invite_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "activation_request_status" AS ENUM ('requested', 'approved', 'rejected');
CREATE OR REPLACE FUNCTION app_private.current_actor_email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_actor_email', true), '') $$;
CREATE OR REPLACE FUNCTION app_private.is_beta_operator() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('app.beta_operator', true), '')::boolean, false) $$;
CREATE TABLE "beta_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "token_digest" text NOT NULL,
  "token_version" integer DEFAULT 1 NOT NULL,
  "status" "beta_invite_status" DEFAULT 'pending' NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_by_external_identity_id" text,
  "accepted_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "beta_invites_email_lowercase_check" CHECK ("email" = lower("email")),
  CONSTRAINT "beta_invites_token_version_positive" CHECK ("token_version" > 0)
);
CREATE UNIQUE INDEX "beta_invites_token_digest_unique" ON "beta_invites" ("token_digest");
CREATE INDEX "beta_invites_email_status_idx" ON "beta_invites" ("email", "status");
CREATE TABLE "workspace_activation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "requested_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "status" "activation_request_status" DEFAULT 'requested' NOT NULL,
  "readiness_snapshot" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "decided_by" text,
  "decided_at" timestamptz,
  "decision_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "workspace_activation_requests_idempotency_unique" ON "workspace_activation_requests" ("organization_id", "workspace_id", "idempotency_key");
CREATE INDEX "workspace_activation_requests_tenant_status_idx" ON "workspace_activation_requests" ("organization_id", "workspace_id", "status");
ALTER TABLE "beta_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "beta_invites" FORCE ROW LEVEL SECURITY;
CREATE POLICY "beta_invites_operator_all" ON "beta_invites" FOR ALL USING (app_private.is_beta_operator()) WITH CHECK (app_private.is_beta_operator());
CREATE POLICY "beta_invites_actor_read" ON "beta_invites" FOR SELECT USING ("email" = app_private.current_actor_email());
CREATE POLICY "beta_invites_actor_accept" ON "beta_invites" FOR UPDATE USING ("email" = app_private.current_actor_email() AND "status" = 'pending') WITH CHECK ("email" = app_private.current_actor_email() AND "status" = 'accepted' AND "accepted_by_external_identity_id" = app_private.current_actor_external_id());
ALTER TABLE "workspace_activation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_activation_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_activation_requests_tenant_read" ON "workspace_activation_requests" FOR SELECT USING ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id());
CREATE POLICY "workspace_activation_requests_tenant_create" ON "workspace_activation_requests" FOR INSERT WITH CHECK ("organization_id" = app_private.current_organization_id() AND "workspace_id" = app_private.current_workspace_id() AND "status" = 'requested');
CREATE POLICY "workspace_activation_requests_operator" ON "workspace_activation_requests" FOR ALL USING (app_private.is_beta_operator()) WITH CHECK (app_private.is_beta_operator());
GRANT EXECUTE ON FUNCTION app_private.current_actor_email() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_beta_operator() TO PUBLIC;
