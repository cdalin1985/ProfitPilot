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

export const organizationMembershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "editor",
  "analyst",
  "client_approver",
  "viewer",
  "organization_admin",
  "billing_admin",
  "member",
]);

export const workspaceMembershipRole = pgEnum("workspace_membership_role", [
  "workspace_admin",
  "strategist",
  "editor",
  "contributor",
  "analyst",
  "client_approver",
  "viewer",
]);

export const membershipStatus = pgEnum("membership_status", ["active", "inactive"]);

export const organizationStatus = pgEnum("organization_status", [
  "active",
  "archived",
  "pending_deletion",
]);

export const workspaceStatus = pgEnum("workspace_status", [
  "setup",
  "active",
  "suspended",
  "archived",
]);

export const onboardingStep = pgEnum("onboarding_step", [
  "workspace_profile",
  "publishing_destination",
  "affiliate_connection",
  "brand_policy",
  "sample_import",
  "evidence_backed_draft",
  "destination_draft",
  "destination_verification",
  "workspace_activation",
]);

export const onboardingStepState = pgEnum("onboarding_step_state", [
  "pending",
  "in_progress",
  "blocked",
  "completed",
]);

export const onboardingRequestStatus = pgEnum("onboarding_request_status", [
  "pending",
  "completed",
  "failed",
]);

export const billingPlan = pgEnum("billing_plan", ["starter", "growth"]);

export const billingSubscriptionStatus = pgEnum("billing_subscription_status", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export const entitlementKey = pgEnum("entitlement_key", [
  "private_beta_access",
  "awin_import",
  "content_generation",
  "wordpress_draft",
  "click_tracking",
  "overview_metrics",
]);

export const entitlementSource = pgEnum("entitlement_source", ["stripe", "manual_beta_grant"]);

export const betaInviteStatus = pgEnum("beta_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const activationRequestStatus = pgEnum("activation_request_status", [
  "requested",
  "approved",
  "rejected",
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

export const feedSyncStatus = pgEnum("feed_sync_status", [
  "idle",
  "running",
  "succeeded",
  "not_modified",
  "failed",
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

export const contentGenerationStatus = pgEnum("content_generation_status", [
  "pending",
  "completed",
  "failed",
]);

export const contentReviewAction = pgEnum("content_review_action", [
  "changes_requested",
  "approved",
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

export const clickClassification = pgEnum("click_classification", [
  "qualified",
  "bot",
  "duplicate",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identityProviderOrganizationId: text("identity_provider_organization_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: organizationStatus("status").notNull().default("active"),
    billingCustomerId: text("billing_customer_id"),
    createdByUserId: uuid("created_by_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(table.slug),
    uniqueIndex("organizations_identity_provider_unique").on(table.identityProviderOrganizationId),
  ],
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
    targetCountry: text("target_country").notNull(),
    defaultLanguage: text("default_language").notNull(),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    niche: text("niche").notNull(),
    status: workspaceStatus("status").notNull().default("setup"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_organization_slug_unique").on(table.organizationId, table.slug),
    index("workspaces_organization_id_idx").on(table.organizationId),
    check("workspaces_target_country_check", sql`${table.targetCountry} ~ '^[A-Z]{2}$'`),
    check("workspaces_default_language_check", sql`${table.defaultLanguage} ~ '^[a-z]{2,3}$'`),
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
    emailVerified: boolean("email_verified").notNull().default(false),
    profilePictureUrl: text("profile_picture_url"),
    disabled: boolean("disabled").notNull().default(false),
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
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
    identityProviderMembershipId: text("identity_provider_membership_id"),
    role: organizationMembershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("memberships_user_id_idx").on(table.userId),
    uniqueIndex("memberships_identity_provider_unique").on(table.identityProviderMembershipId),
    check(
      "memberships_organization_role_check",
      sql`${table.role} in ('owner', 'organization_admin', 'billing_admin', 'member')`,
    ),
  ],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceMembershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_memberships_organization_user_idx").on(table.organizationId, table.userId),
  ],
);

export const workspaceOnboardingSteps = pgTable(
  "workspace_onboarding_steps",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    step: onboardingStep("step").notNull(),
    position: integer("position").notNull(),
    state: onboardingStepState("state").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
    evidence: jsonb("evidence")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.step] }),
    uniqueIndex("workspace_onboarding_position_unique").on(table.workspaceId, table.position),
    index("workspace_onboarding_tenant_idx").on(table.organizationId, table.workspaceId),
    check("workspace_onboarding_position_positive", sql`${table.position} > 0`),
  ],
);

export const onboardingRequests = pgTable(
  "onboarding_requests",
  {
    idempotencyKey: uuid("idempotency_key").primaryKey(),
    externalIdentityId: text("external_identity_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    identityProviderOrganizationId: text("identity_provider_organization_id"),
    identityProviderMembershipId: text("identity_provider_membership_id"),
    status: onboardingRequestStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("onboarding_requests_actor_time_idx").on(table.externalIdentityId, table.createdAt),
    uniqueIndex("onboarding_requests_organization_unique").on(table.organizationId),
    uniqueIndex("onboarding_requests_workspace_unique").on(table.workspaceId),
    check("onboarding_requests_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
);

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billingWorkspaceId: uuid("billing_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    stripeProductId: text("stripe_product_id"),
    plan: billingPlan("plan"),
    status: billingSubscriptionStatus("status"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    lastStripeEventCreatedAt: timestamp("last_stripe_event_created_at", {
      withTimezone: true,
    }),
    lastStripeEventId: text("last_stripe_event_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("billing_accounts_stripe_customer_unique").on(table.stripeCustomerId),
    uniqueIndex("billing_accounts_stripe_subscription_unique").on(table.stripeSubscriptionId),
    index("billing_accounts_workspace_idx").on(table.organizationId, table.billingWorkspaceId),
  ],
);

export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    stripeEventId: text("stripe_event_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }).notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("billing_webhook_events_tenant_time_idx").on(
      table.organizationId,
      table.workspaceId,
      table.eventCreatedAt,
    ),
    check("billing_webhook_events_hash_check", sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const organizationEntitlements = pgTable(
  "organization_entitlements",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: entitlementKey("key").notNull(),
    source: entitlementSource("source").notNull(),
    sourceReference: text("source_reference").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    limit: integer("limit"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.key, table.source] }),
    index("organization_entitlements_effective_idx").on(
      table.organizationId,
      table.enabled,
      table.expiresAt,
    ),
    check(
      "organization_entitlements_limit_positive",
      sql`${table.limit} is null or ${table.limit} > 0`,
    ),
  ],
);

export const betaInvites = pgTable(
  "beta_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenDigest: text("token_digest").notNull(),
    tokenVersion: integer("token_version").notNull().default(1),
    status: betaInviteStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByExternalIdentityId: text("accepted_by_external_identity_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("beta_invites_token_digest_unique").on(table.tokenDigest),
    index("beta_invites_email_status_idx").on(table.email, table.status),
    check("beta_invites_email_lowercase_check", sql`${table.email} = lower(${table.email})`),
    check("beta_invites_token_version_positive", sql`${table.tokenVersion} > 0`),
  ],
);

export const workspaceActivationRequests = pgTable(
  "workspace_activation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: activationRequestStatus("status").notNull().default("requested"),
    readinessSnapshot: jsonb("readiness_snapshot").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_activation_requests_idempotency_unique").on(
      table.organizationId,
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("workspace_activation_requests_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
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
    index("affiliate_connections_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
  ],
);

export const feedSyncStates = pgTable(
  "feed_sync_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => affiliateConnections.id, { onDelete: "cascade" }),
    publisherId: integer("publisher_id").notNull(),
    advertiserId: integer("advertiser_id").notNull(),
    locale: text("locale").notNull(),
    status: feedSyncStatus("status").notNull().default("idle"),
    sourceEtag: text("source_etag"),
    sourceLastModifiedAt: timestamp("source_last_modified_at", { withTimezone: true }),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastProductCount: integer("last_product_count").notNull().default(0),
    lastRejectedCount: integer("last_rejected_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("feed_sync_states_source_unique").on(
      table.workspaceId,
      table.connectionId,
      table.publisherId,
      table.advertiserId,
      table.locale,
    ),
    index("feed_sync_states_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
    check("feed_sync_states_publisher_positive", sql`${table.publisherId} > 0`),
    check("feed_sync_states_advertiser_positive", sql`${table.advertiserId} > 0`),
    check("feed_sync_states_locale_check", sql`${table.locale} ~ '^[a-z]{2}_[A-Z]{2}$'`),
    check(
      "feed_sync_states_counts_nonnegative",
      sql`${table.lastProductCount} >= 0 and ${table.lastRejectedCount} >= 0`,
    ),
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
    index("opportunities_tenant_product_scored_idx").on(
      table.organizationId,
      table.workspaceId,
      table.productId,
      table.scoredAt.desc(),
    ),
    uniqueIndex("opportunities_product_version_time_unique").on(
      table.productId,
      table.scoreVersion,
      table.scoredAt,
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
    index("content_items_tenant_status_updated_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
      table.updatedAt.desc(),
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

export const contentGenerationRequests = pgTable(
  "content_generation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: contentGenerationStatus("status").notNull().default("pending"),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    result: jsonb("result"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("content_generation_requests_idempotency_unique").on(
      table.organizationId,
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("content_generation_requests_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
  ],
);

export const contentReviewActions = pgTable(
  "content_review_actions",
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
    contentRevisionId: uuid("content_revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: contentReviewAction("action").notNull(),
    comment: text("comment"),
    requiredChanges: jsonb("required_changes").notNull().default([]),
    validatorSnapshot: jsonb("validator_snapshot").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_review_actions_idempotency_unique").on(
      table.organizationId,
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("content_review_actions_tenant_content_time_idx").on(
      table.organizationId,
      table.workspaceId,
      table.contentItemId,
      table.createdAt,
    ),
  ],
);

export const publishingDestinations = pgTable(
  "publishing_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: destinationType("type").notNull(),
    baseUrl: text("base_url").notNull(),
    secretReference: text("secret_reference").notNull(),
    status: connectionStatus("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("publishing_destinations_tenant_url_unique").on(
      table.organizationId,
      table.workspaceId,
      table.type,
      table.baseUrl,
    ),
    index("publishing_destinations_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
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
    requestFingerprint: text("request_fingerprint").notNull().default(""),
    status: publicationStatus("status").notNull(),
    remotePostId: text("remote_post_id"),
    remoteSlug: text("remote_slug"),
    remoteStatus: text("remote_status"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("publications_idempotency_unique").on(
      table.organizationId,
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("publications_tenant_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
    ),
    index("publications_tenant_revision_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.contentRevisionId,
      table.status,
    ),
    index("publications_tenant_created_status_idx").on(
      table.organizationId,
      table.workspaceId,
      table.createdAt.desc(),
      table.status,
    ),
  ],
);

export const affiliateLinks = pgTable(
  "affiliate_links",
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
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    publicationId: uuid("publication_id").references(() => publications.id, {
      onDelete: "set null",
    }),
    destinationUrl: text("destination_url").notNull(),
    destinationUrlHash: text("destination_url_hash").notNull(),
    destinationHost: text("destination_host").notNull(),
    signingKeyId: text("signing_key_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("affiliate_links_idempotency_unique").on(
      table.organizationId,
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("affiliate_links_revision_product_idx").on(table.contentRevisionId, table.productId),
    index("affiliate_links_tenant_expiry_idx").on(
      table.organizationId,
      table.workspaceId,
      table.expiresAt,
    ),
    check("affiliate_links_https_check", sql`${table.destinationUrl} like 'https://%'`),
  ],
);

export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    affiliateLinkId: uuid("affiliate_link_id")
      .notNull()
      .references(() => affiliateLinks.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    visitorHash: text("visitor_hash").notNull(),
    privacyKeyId: text("privacy_key_id").notNull(),
    userAgentClass: text("user_agent_class").notNull(),
    classification: clickClassification("classification").notNull(),
    reasonCode: text("reason_code").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
  },
  (table) => [
    index("click_events_tenant_time_idx").on(
      table.organizationId,
      table.workspaceId,
      table.receivedAt,
    ),
    index("click_events_qualified_tenant_occurred_idx")
      .on(table.organizationId, table.workspaceId, table.occurredAt.desc())
      .where(sql`${table.classification} = 'qualified'`),
    index("click_events_link_visitor_time_idx").on(
      table.affiliateLinkId,
      table.visitorHash,
      table.receivedAt,
    ),
    check("click_events_visitor_hash_check", sql`${table.visitorHash} ~ '^[a-f0-9]{64}$'`),
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
