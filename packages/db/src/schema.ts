import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "editor",
  "analyst",
  "client_approver",
  "viewer",
]);

export const connectionStatus = pgEnum("connection_status", [
  "pending",
  "testing",
  "active",
  "degraded",
  "action_required",
  "revoked",
  "disabled",
]);

export const affiliateProvider = pgEnum("affiliate_provider", [
  "awin",
  "cj_affiliate",
  "amazon_associates",
  "manual_feed",
]);

export const contentType = pgEnum("content_type", ["article", "comparison", "roundup", "social"]);

export const contentStatus = pgEnum("content_status", [
  "draft",
  "generating",
  "validating",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "failed",
  "archived",
]);

export const evidenceSourceType = pgEnum("evidence_source_type", [
  "network_feed",
  "merchant_page",
  "publisher_attestation",
]);

export const destinationType = pgEnum("destination_type", ["wordpress", "shopify", "webhook"]);

export const publicationStatus = pgEnum("publication_status", [
  "pending",
  "creating_draft",
  "draft_created",
  "scheduled",
  "published",
  "verification_failed",
  "failed",
  "cancelled",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    billingCustomerId: text("billing_customer_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_organization_slug_unique").on(table.organizationId, table.slug),
    index("workspaces_organization_id_idx").on(table.organizationId),
    check("workspaces_currency_iso_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalIdentityId: text("external_identity_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    disabled: boolean("disabled").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_external_identity_unique").on(table.externalIdentityId),
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const affiliateConnections = pgTable(
  "affiliate_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: affiliateProvider("provider").notNull(),
    secretReference: text("secret_reference").notNull(),
    status: connectionStatus("status").notNull().default("pending"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    policyVersion: text("policy_version").notNull(),
    ...timestamps,
  },
  (table) => [
    index("affiliate_connections_tenant_idx").on(table.organizationId, table.workspaceId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => affiliateConnections.id, {
      onDelete: "set null",
    }),
    sourceProductId: text("source_product_id").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    name: text("name").notNull(),
    merchantName: text("merchant_name").notNull(),
    currency: text("currency").notNull(),
    price: numeric("price", { precision: 18, scale: 4 }),
    commissionRate: numeric("commission_rate", { precision: 8, scale: 4 }),
    available: boolean("available").notNull().default(true),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourcePayload: jsonb("source_payload").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_source_identity_unique").on(
      table.workspaceId,
      table.connectionId,
      table.sourceProductId,
    ),
    index("products_tenant_canonical_idx").on(
      table.organizationId,
      table.workspaceId,
      table.canonicalKey,
    ),
    check("products_currency_iso_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("products_price_nonnegative_check", sql`${table.price} is null or ${table.price} >= 0`),
    check(
      "products_commission_rate_check",
      sql`${table.commissionRate} is null or (${table.commissionRate} >= 0 and ${table.commissionRate} <= 100)`,
    ),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    scoreVersion: text("score_version").notNull(),
    explanation: jsonb("explanation").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("opportunities_tenant_score_idx").on(
      table.organizationId,
      table.workspaceId,
      table.score,
    ),
    check("opportunities_score_check", sql`${table.score} between 0 and 100`),
  ],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentType: contentType("content_type").notNull(),
    status: contentStatus("status").notNull().default("draft"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    currentRevisionId: uuid("current_revision_id").references(
      (): AnyPgColumn => contentRevisions.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    index("content_items_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
  ],
);

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    body: jsonb("body").notNull(),
    disclosureVersion: text("disclosure_version").notNull(),
    promptVersion: text("prompt_version"),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    validatorResults: jsonb("validator_results").notNull(),
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_revision_number_unique").on(table.contentItemId, table.revisionNumber),
    index("content_revisions_tenant_idx").on(table.organizationId, table.workspaceId),
    check("content_revisions_revision_positive_check", sql`${table.revisionNumber} > 0`),
  ],
);

export const evidenceRecords = pgTable(
  "evidence_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentRevisionId: uuid("content_revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "cascade" }),
    claimKey: text("claim_key").notNull(),
    sourceType: evidenceSourceType("source_type").notNull(),
    sourceReference: text("source_reference").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    sourceExcerptHash: text("source_excerpt_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("evidence_records_revision_claim_idx").on(table.contentRevisionId, table.claimKey),
    index("evidence_records_tenant_idx").on(table.organizationId, table.workspaceId),
  ],
);

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentRevisionId: uuid("content_revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "restrict" }),
    destinationType: destinationType("destination_type").notNull(),
    destinationId: text("destination_id"),
    canonicalUrl: text("canonical_url"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: publicationStatus("status").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("publications_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("publications_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id"),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id"),
    sourceIpHash: text("source_ip_hash"),
    details: jsonb("details").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_tenant_time_idx").on(
      table.organizationId,
      table.workspaceId,
      table.occurredAt,
    ),
  ],
);
