CREATE TYPE "public"."content_review_action" AS ENUM('changes_requested', 'approved');--> statement-breakpoint
CREATE TABLE "content_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_revision_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "content_review_action" NOT NULL,
	"comment" text,
	"required_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validator_snapshot" jsonb NOT NULL,
	"request_fingerprint" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_content_revision_id_content_revisions_id_fk" FOREIGN KEY ("content_revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_review_actions_idempotency_unique" ON "content_review_actions" USING btree ("organization_id","workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "content_review_actions_tenant_content_time_idx" ON "content_review_actions" USING btree ("organization_id","workspace_id","content_item_id","created_at");--> statement-breakpoint
ALTER TABLE "content_review_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_review_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_review_actions_tenant_read" ON "content_review_actions"
  FOR SELECT
  USING (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );--> statement-breakpoint
CREATE POLICY "content_review_actions_tenant_insert" ON "content_review_actions"
  FOR INSERT
  WITH CHECK (
    "organization_id" = "app_private"."current_organization_id"()
    AND "workspace_id" = "app_private"."current_workspace_id"()
  );
