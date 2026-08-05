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
  }, "Enter a valid BCP 47 locale");

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
});

export type QueueItem = z.infer<typeof queueItemSchema>;

export const overviewSchema = z.object({
  metrics: z.object({
    qualifiedClicks: z.number().int().nonnegative(),
    commissionAmount: z.number().nonnegative(),
    commissionCurrency: z.string().length(3),
    contentAwaitingReview: z.number().int().nonnegative(),
    publishingHealthPercent: z.number().min(0).max(100),
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

export type TestAwinConnection = z.infer<typeof testAwinConnectionSchema>;
export type AwinConnectionTestResponse = z.infer<typeof awinConnectionTestResponseSchema>;
