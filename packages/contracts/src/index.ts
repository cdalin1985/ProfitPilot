import { z } from "zod";

export const identifierSchema = z.string().uuid();

export const roleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "analyst",
  "client_approver",
  "viewer",
]);

export type Role = z.infer<typeof roleSchema>;

export const tenantContextSchema = z.object({
  organizationId: identifierSchema,
  workspaceId: identifierSchema,
  userId: identifierSchema,
  role: roleSchema,
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

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
