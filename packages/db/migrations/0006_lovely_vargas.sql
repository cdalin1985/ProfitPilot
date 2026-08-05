CREATE TYPE "public"."content_generation_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "content_generation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" "content_generation_status" DEFAULT 'pending' NOT NULL,
	"content_item_id" uuid,
	"result" jsonb,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_generation_requests" ADD CONSTRAINT "content_generation_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_requests" ADD CONSTRAINT "content_generation_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_requests" ADD CONSTRAINT "content_generation_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_requests" ADD CONSTRAINT "content_generation_requests_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_generation_requests_idempotency_unique" ON "content_generation_requests" USING btree ("organization_id","workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "content_generation_requests_tenant_status_idx" ON "content_generation_requests" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint

ALTER TABLE "content_generation_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_generation_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_generation_requests_tenant_access" ON "content_generation_requests"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );
