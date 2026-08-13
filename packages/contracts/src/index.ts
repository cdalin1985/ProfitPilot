import countries from "i18n-iso-countries";
import { z } from "zod";

export const identifierSchema = z.string().uuid();

export const organizationRoleSchema = z.enum([
  "owner",
  "organization_admin",
  "billing_admin",
  "member",
]);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const workspaceRoleSchema = z.enum([
  "workspace_admin",
  "strategist",
  "editor",
  "contributor",
  "analyst",
  "client_approver",
  "viewer",
]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const roleSchema = z.union([organizationRoleSchema, workspaceRoleSchema]);

export type Role = z.infer<typeof roleSchema>;

export const authenticatedActorSchema = z.object({
  externalIdentityId: z.string().min(1).max(255),
  identityProviderOrganizationId: z.string().min(1).max(255).optional(),
  sessionId: z.string().min(1).max(255).optional(),
});

export type AuthenticatedActor = z.infer<typeof authenticatedActorSchema>;

export const tenantContextSchema = z.object({
  organizationId: identifierSchema,
  workspaceId: identifierSchema,
  userId: identifierSchema,
  organizationRole: organizationRoleSchema,
  workspaceRole: workspaceRoleSchema.nullable(),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

const canonicalLocaleSchema = z
  .string()
  .min(2)
  .max(35)
  .refine((value) => {
    try {
      return Intl.getCanonicalLocales(value).length === 1;
    } catch {
      return false;
    }
  }, "Enter a valid BCP 47 locale")
  .transform((value) => Intl.getCanonicalLocales(value)[0]!);

const supportedCurrencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/)
  .refine(
    (value) => Intl.supportedValuesOf("currency").includes(value),
    "Select a supported ISO 4217 currency",
  );

const supportedTimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (value) => value === "UTC" || Intl.supportedValuesOf("timeZone").includes(value),
    "Select a supported IANA timezone",
  );

export const workspaceProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  targetCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .refine((value) => countries.isValid(value), "Select a valid ISO 3166-1 country"),
  defaultLanguage: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}$/),
  locale: canonicalLocaleSchema,
  currency: supportedCurrencySchema,
  timezone: supportedTimezoneSchema,
  niche: z.string().trim().min(2).max(80),
});

export type WorkspaceProfile = z.infer<typeof workspaceProfileSchema>;

export const createOrganizationWorkspaceSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  workspace: workspaceProfileSchema,
});

export type CreateOrganizationWorkspace = z.infer<typeof createOrganizationWorkspaceSchema>;

export const onboardingStepSchema = z.enum([
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

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

export const onboardingStepStateSchema = z.enum(["pending", "in_progress", "blocked", "completed"]);

export const onboardingProgressSchema = z.object({
  status: z.enum(["in_progress", "blocked", "ready_for_activation", "completed"]),
  currentStep: onboardingStepSchema,
  steps: z.array(
    z.object({
      step: onboardingStepSchema,
      position: z.number().int().min(1),
      state: onboardingStepStateSchema,
      completedAt: z.string().datetime().nullable(),
    }),
  ),
});

export type OnboardingProgress = z.infer<typeof onboardingProgressSchema>;

export const organizationWorkspaceSchema = z.object({
  organization: z.object({
    id: identifierSchema,
    identityProviderOrganizationId: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    role: organizationRoleSchema,
  }),
  workspace: workspaceProfileSchema.extend({
    id: identifierSchema,
    slug: z.string().min(1),
    status: z.enum(["setup", "active", "suspended", "archived"]),
    role: workspaceRoleSchema.nullable(),
  }),
  onboarding: onboardingProgressSchema,
});

export type OrganizationWorkspace = z.infer<typeof organizationWorkspaceSchema>;

export const createOrganizationWorkspaceResponseSchema = organizationWorkspaceSchema.extend({
  replayed: z.boolean(),
});

export type CreateOrganizationWorkspaceResponse = z.infer<
  typeof createOrganizationWorkspaceResponseSchema
>;

const selectableWorkspaceSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(["setup", "active", "suspended"]),
});

export const sessionStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("onboarding_required"),
  }),
  z.object({
    status: z.literal("organization_selection_required"),
    organizations: z.array(
      z.object({
        id: identifierSchema,
        identityProviderOrganizationId: z.string().min(1),
        name: z.string().min(1),
      }),
    ),
  }),
  z.object({
    status: z.literal("workspace_selection_required"),
    organization: z.object({
      id: identifierSchema,
      identityProviderOrganizationId: z.string().min(1),
      name: z.string().min(1),
    }),
    workspaces: z.array(selectableWorkspaceSchema).min(1),
  }),
  z.object({
    status: z.literal("active"),
    tenant: tenantContextSchema,
    active: organizationWorkspaceSchema,
    availableWorkspaces: z.array(selectableWorkspaceSchema),
  }),
]);

export type SessionState = z.infer<typeof sessionStateSchema>;

export const opportunityLevelSchema = z.enum(["high", "medium", "low"]);
export const freshnessTrendSchema = z.enum(["rising", "new", "steady", "falling"]);

export const opportunitySchema = z.object({
  id: identifierSchema,
  productName: z.string().min(1).max(240),
  network: z.enum(["awin", "cj_affiliate", "amazon_associates", "manual_feed"]),
  level: opportunityLevelSchema,
  score: z.number().int().min(0).max(100),
  commissionRate: z.number().min(0).max(100),
  averageCommission: z.number().nonnegative(),
  commissionCurrency: z.string().length(3),
  observedAt: z.string().datetime(),
  freshnessTrend: freshnessTrendSchema,
});

export type Opportunity = z.infer<typeof opportunitySchema>;

export const queueItemSchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(240),
  subject: z.string().min(1).max(240),
  status: z.enum(["needs_review", "ready_to_publish", "needs_reconnect"]),
  occurredAt: z.string().datetime(),
  href: z.string().startsWith("/"),
});

export type QueueItem = z.infer<typeof queueItemSchema>;

export const overviewSchema = z.object({
  metrics: z.object({
    qualifiedClicks: z.number().int().nonnegative(),
    commissionAmount: z.number().nonnegative(),
    commissionCurrency: z.string().length(3),
    commissionAvailable: z.boolean(),
    contentAwaitingReview: z.number().int().nonnegative(),
    publishingHealthPercent: z.number().min(0).max(100).nullable(),
  }),
  opportunities: z.array(opportunitySchema).max(20),
  queue: z.array(queueItemSchema).max(20),
  pipeline: z.object({
    draft: z.number().int().nonnegative(),
    inReview: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
  }),
  generatedAt: z.string().datetime(),
});

export type Overview = z.infer<typeof overviewSchema>;

export const validationCheckSchema = z.object({
  key: z.enum([
    "factual_grounding",
    "disclosure",
    "prohibited_claims",
    "near_duplicate",
    "link_policy",
  ]),
  label: z.string().min(1),
  result: z.string().min(1),
  status: z.enum(["pass", "warning", "fail"]),
});

export const evidenceSchema = z.object({
  id: identifierSchema,
  label: z.string().min(1).max(120),
  sourceType: z.enum(["network_feed", "merchant_page", "publisher_attestation"]),
  observedAt: z.string().datetime(),
  sourceUrl: z.string().url().optional(),
});

export const contentReviewSchema = z.object({
  id: identifierSchema,
  revisionId: identifierSchema,
  title: z.string().min(1).max(240),
  status: z.enum(["draft", "validating", "in_review", "changes_requested", "approved"]),
  revision: z.number().int().positive(),
  owner: z.string().min(1),
  locale: z.string().min(2).max(16),
  productName: z.string().min(1),
  network: z.string().min(1),
  destination: z.string().min(1),
  disclosure: z.string().min(1),
  introduction: z.string().min(1),
  selectedClaim: z.string().min(1),
  validationChecks: z.array(validationCheckSchema),
  evidence: z.array(evidenceSchema),
  unresolvedComments: z.number().int().nonnegative(),
});

export type ContentReview = z.infer<typeof contentReviewSchema>;

export const requestContentChangesSchema = z.object({
  revisionId: identifierSchema,
  summary: z.string().trim().min(10).max(2_000),
  requiredChanges: z.array(z.string().trim().min(3).max(500)).min(1).max(10),
});

export const approveContentRevisionSchema = z.object({
  revisionId: identifierSchema,
  note: z.string().trim().max(1_000).optional(),
});

export const contentReviewActionResponseSchema = z.object({
  contentId: identifierSchema,
  revisionId: identifierSchema,
  actionId: identifierSchema,
  action: z.enum(["changes_requested", "approved"]),
  status: z.enum(["changes_requested", "approved"]),
  actedAt: z.string().datetime(),
  replayed: z.boolean(),
});

export type RequestContentChanges = z.infer<typeof requestContentChangesSchema>;
export type ApproveContentRevision = z.infer<typeof approveContentRevisionSchema>;
export type ContentReviewActionResponse = z.infer<typeof contentReviewActionResponseSchema>;

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const testAwinConnectionSchema = z.object({
  accessToken: z.string().trim().min(20).max(4096),
});

export const awinConnectionTestResponseSchema = z.object({
  provider: z.literal("awin"),
  status: z.literal("verified"),
  publishers: z.array(
    z.object({
      publisherId: z.number().int().positive(),
      name: z.string().min(1),
    }),
  ),
  verifiedAt: z.string().datetime(),
});

export const importAwinFeedSchema = z.object({
  connectionId: identifierSchema,
  publisherId: z.number().int().positive(),
  advertiserId: z.number().int().positive(),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}_[A-Z]{2}$/, "Use an Awin feed locale such as en_US"),
  commissionRate: z.number().min(0).max(100).optional(),
});

export const awinFeedImportResponseSchema = z.object({
  provider: z.literal("awin"),
  status: z.enum(["ingested", "not_modified"]),
  feed: z.object({
    publisherId: z.number().int().positive(),
    advertiserId: z.number().int().positive(),
    locale: z.string(),
  }),
  products: z.object({
    received: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  nextEligibleAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export type TestAwinConnection = z.infer<typeof testAwinConnectionSchema>;
export type AwinConnectionTestResponse = z.infer<typeof awinConnectionTestResponseSchema>;
export type ImportAwinFeed = z.infer<typeof importAwinFeedSchema>;
export type AwinFeedImportResponse = z.infer<typeof awinFeedImportResponseSchema>;

export const createContentDraftSchema = z.object({
  opportunityId: identifierSchema,
  title: z.string().trim().min(8).max(240),
  contentType: z.enum(["article", "comparison", "roundup", "social"]),
  locale: canonicalLocaleSchema,
  brief: z.object({
    audience: z.string().trim().min(3).max(240),
    angle: z.string().trim().min(3).max(500),
    tone: z.enum(["practical", "editorial", "concise", "technical"]),
  }),
});

export const contentDraftResponseSchema = z.object({
  contentId: identifierSchema,
  revisionId: identifierSchema,
  status: z.enum(["in_review", "changes_requested"]),
  revision: z.number().int().positive(),
  validationChecks: z.array(validationCheckSchema).length(5),
  evidenceCount: z.number().int().nonnegative(),
  promptVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  replayed: z.boolean(),
});

export type CreateContentDraft = z.infer<typeof createContentDraftSchema>;
export type ContentDraftResponse = z.infer<typeof contentDraftResponseSchema>;

const wordpressSiteUrlSchema = z.string().trim().url().max(2_048);
const wordpressUsernameSchema = z.string().trim().min(1).max(255);
const wordpressApplicationPasswordSchema = z.string().trim().min(20).max(512);

export const testWordPressConnectionSchema = z.object({
  siteUrl: wordpressSiteUrlSchema,
  username: wordpressUsernameSchema,
  applicationPassword: wordpressApplicationPasswordSchema,
});

export const wordpressConnectionTestResponseSchema = z.object({
  provider: z.literal("wordpress"),
  status: z.literal("verified"),
  siteUrl: wordpressSiteUrlSchema,
  user: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(255),
  }),
  verifiedAt: z.string().datetime(),
});

export const configureWordPressDestinationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  siteUrl: wordpressSiteUrlSchema,
  secretReference: z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .refine((value) => !/[\r\n\0]/.test(value), "Enter a valid secret reference"),
});

export const wordpressDestinationSchema = z.object({
  id: identifierSchema,
  type: z.literal("wordpress"),
  name: z.string().min(1).max(120),
  siteUrl: wordpressSiteUrlSchema,
  status: z.literal("active"),
  verifiedAt: z.string().datetime(),
});

export const createWordPressDraftSchema = z.object({
  destinationId: identifierSchema,
  revisionId: identifierSchema,
});

export const wordpressDraftPublicationSchema = z.object({
  publicationId: identifierSchema,
  contentId: identifierSchema,
  revisionId: identifierSchema,
  destinationId: identifierSchema,
  status: z.literal("draft_created"),
  remotePostId: z.string().min(1).max(255),
  remoteSlug: z.string().min(1).max(200),
  remoteUrl: z.string().url(),
  createdAt: z.string().datetime(),
  replayed: z.boolean(),
});

export type TestWordPressConnection = z.infer<typeof testWordPressConnectionSchema>;
export type WordPressConnectionTestResponse = z.infer<typeof wordpressConnectionTestResponseSchema>;
export type ConfigureWordPressDestination = z.infer<typeof configureWordPressDestinationSchema>;
export type WordPressDestination = z.infer<typeof wordpressDestinationSchema>;
export type CreateWordPressDraft = z.infer<typeof createWordPressDraftSchema>;
export type WordPressDraftPublication = z.infer<typeof wordpressDraftPublicationSchema>;

export const createAffiliateLinkSchema = z.object({
  revisionId: identifierSchema,
  expiresInDays: z.number().int().min(1).max(400).default(180),
});

export const affiliateLinkSchema = z.object({
  linkId: identifierSchema,
  contentId: identifierSchema,
  revisionId: identifierSchema,
  productId: identifierSchema,
  redirectUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  replayed: z.boolean(),
});

export const clickEventEnvelopeSchema = z.object({
  eventId: identifierSchema,
  linkId: identifierSchema,
  organizationId: identifierSchema,
  workspaceId: identifierSchema,
  occurredAt: z.string().datetime(),
  method: z.enum(["GET", "HEAD"]),
  visitorHash: z.string().regex(/^[a-f0-9]{64}$/),
  privacyKeyId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  userAgentClass: z.string().trim().min(1).max(64),
  botReason: z.string().trim().min(1).max(64).nullable(),
});

export const clickEventResultSchema = z.object({
  eventId: identifierSchema,
  classification: z.enum(["qualified", "bot", "duplicate"]),
  reasonCode: z.string().min(1).max(64),
  replayed: z.boolean(),
});

export type CreateAffiliateLink = z.infer<typeof createAffiliateLinkSchema>;
export type AffiliateLink = z.infer<typeof affiliateLinkSchema>;
export type ClickEventEnvelope = z.infer<typeof clickEventEnvelopeSchema>;
export type ClickEventResult = z.infer<typeof clickEventResultSchema>;
