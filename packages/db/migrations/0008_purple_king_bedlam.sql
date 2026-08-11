CREATE TABLE "publishing_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "destination_type" NOT NULL,
	"base_url" text NOT NULL,
	"secret_reference" text NOT NULL,
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "publications_idempotency_unique";--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "request_fingerprint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "remote_post_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "remote_slug" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "remote_status" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "publishing_destinations" ADD CONSTRAINT "publishing_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_destinations" ADD CONSTRAINT "publishing_destinations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_destinations_tenant_url_unique" ON "publishing_destinations" USING btree ("organization_id","workspace_id","type","base_url");--> statement-breakpoint
CREATE INDEX "publishing_destinations_tenant_status_idx" ON "publishing_destinations" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_idempotency_unique" ON "publications" USING btree ("organization_id","workspace_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "publishing_destinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publishing_destinations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "publishing_destinations_tenant_access" ON "publishing_destinations"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );
