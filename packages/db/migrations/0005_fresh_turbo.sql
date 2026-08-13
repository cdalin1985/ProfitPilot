CREATE TYPE "public"."feed_sync_status" AS ENUM('idle', 'running', 'succeeded', 'not_modified', 'failed');--> statement-breakpoint
CREATE TABLE "feed_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"publisher_id" integer NOT NULL,
	"advertiser_id" integer NOT NULL,
	"locale" text NOT NULL,
	"status" "feed_sync_status" DEFAULT 'idle' NOT NULL,
	"source_etag" text,
	"source_last_modified_at" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"next_eligible_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"last_product_count" integer DEFAULT 0 NOT NULL,
	"last_rejected_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_sync_states_publisher_positive" CHECK ("feed_sync_states"."publisher_id" > 0),
	CONSTRAINT "feed_sync_states_advertiser_positive" CHECK ("feed_sync_states"."advertiser_id" > 0),
	CONSTRAINT "feed_sync_states_locale_check" CHECK ("feed_sync_states"."locale" ~ '^[a-z]{2}_[A-Z]{2}$'),
	CONSTRAINT "feed_sync_states_counts_nonnegative" CHECK ("feed_sync_states"."last_product_count" >= 0 and "feed_sync_states"."last_rejected_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "feed_sync_states" ADD CONSTRAINT "feed_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_sync_states" ADD CONSTRAINT "feed_sync_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_sync_states" ADD CONSTRAINT "feed_sync_states_connection_id_affiliate_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."affiliate_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_sync_states_source_unique" ON "feed_sync_states" USING btree ("workspace_id","connection_id","publisher_id","advertiser_id","locale");--> statement-breakpoint
CREATE INDEX "feed_sync_states_tenant_status_idx" ON "feed_sync_states" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_product_version_time_unique" ON "opportunities" USING btree ("product_id","score_version","scored_at");--> statement-breakpoint

ALTER TABLE "feed_sync_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feed_sync_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "feed_sync_states_tenant_access" ON "feed_sync_states"
  FOR ALL
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  )
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );
