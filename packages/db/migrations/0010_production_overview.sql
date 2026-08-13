CREATE INDEX "affiliate_connections_tenant_status_idx" ON "affiliate_connections" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_tenant_product_scored_idx" ON "opportunities" USING btree ("organization_id","workspace_id","product_id","scored_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_items_tenant_status_updated_idx" ON "content_items" USING btree ("organization_id","workspace_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publications_tenant_revision_status_idx" ON "publications" USING btree ("organization_id","workspace_id","content_revision_id","status");--> statement-breakpoint
CREATE INDEX "publications_tenant_created_status_idx" ON "publications" USING btree ("organization_id","workspace_id","created_at" DESC NULLS LAST,"status");--> statement-breakpoint
CREATE INDEX "click_events_qualified_tenant_occurred_idx" ON "click_events" USING btree ("organization_id","workspace_id","occurred_at" DESC NULLS LAST) WHERE "classification" = 'qualified';
