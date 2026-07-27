CREATE TYPE "public"."affiliate_provider" AS ENUM('awin', 'cj_affiliate', 'amazon_associates', 'manual_feed');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('article', 'comparison', 'roundup', 'social');--> statement-breakpoint
CREATE TYPE "public"."destination_type" AS ENUM('wordpress', 'shopify', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('network_feed', 'merchant_page', 'publisher_attestation');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending', 'creating_draft', 'draft_created', 'scheduled', 'published', 'verification_failed', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "affiliate_connections" ALTER COLUMN "provider" SET DATA TYPE "public"."affiliate_provider" USING "provider"::"public"."affiliate_provider";--> statement-breakpoint
ALTER TABLE "content_items" ALTER COLUMN "content_type" SET DATA TYPE "public"."content_type" USING "content_type"::"public"."content_type";--> statement-breakpoint
ALTER TABLE "evidence_records" ALTER COLUMN "source_type" SET DATA TYPE "public"."evidence_source_type" USING "source_type"::"public"."evidence_source_type";--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "destination_type" SET DATA TYPE "public"."destination_type" USING "destination_type"::"public"."destination_type";--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "status" SET DATA TYPE "public"."publication_status" USING "status"::"public"."publication_status";--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_revision_positive_check" CHECK ("content_revisions"."revision_number" > 0);--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_score_check" CHECK ("opportunities"."score" between 0 and 100);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_currency_iso_check" CHECK ("products"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative_check" CHECK ("products"."price" is null or "products"."price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_commission_rate_check" CHECK ("products"."commission_rate" is null or ("products"."commission_rate" >= 0 and "products"."commission_rate" <= 100));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_currency_iso_check" CHECK ("workspaces"."currency" ~ '^[A-Z]{3}$');