import type { ContentReview, Overview, SessionState, TenantContext } from "@profit-pilot/contracts";

export const fixtureWorkspaceId = "018f6d4d-74d4-7c18-a1d4-bb620a63b002";
export const fixtureContentId = "018f6d4d-74d4-7c18-a1d4-bb620a63b201";
const developmentOnboardingSteps = [
  "workspace_profile",
  "publishing_destination",
  "affiliate_connection",
  "brand_policy",
  "sample_import",
  "evidence_backed_draft",
  "destination_draft",
  "destination_verification",
  "workspace_activation",
] as const;

export const developmentTenantContext: TenantContext = {
  organizationId: "018f6d4d-74d4-7c18-a1d4-bb620a63b001",
  workspaceId: fixtureWorkspaceId,
  userId: "018f6d4d-74d4-7c18-a1d4-bb620a63b003",
  organizationRole: "owner",
  workspaceRole: "workspace_admin",
};

export const developmentSession: Extract<SessionState, { status: "active" }> = {
  status: "active",
  tenant: developmentTenantContext,
  active: {
    organization: {
      id: developmentTenantContext.organizationId,
      identityProviderOrganizationId: "org_development_profit_pilot",
      name: "Northstar Media",
      slug: "northstar-media",
      role: "owner",
    },
    workspace: {
      id: developmentTenantContext.workspaceId,
      name: "US Editorial",
      slug: "us-editorial",
      targetCountry: "US",
      defaultLanguage: "en",
      locale: "en-US",
      currency: "USD",
      timezone: "America/New_York",
      niche: "Consumer technology",
      status: "active",
      role: "workspace_admin",
    },
    onboarding: {
      status: "completed",
      currentStep: "workspace_activation",
      steps: developmentOnboardingSteps.map((step, index) => ({
        step,
        position: index + 1,
        state: "completed",
        completedAt: "2026-07-27T00:00:00.000Z",
      })),
    },
  },
  availableWorkspaces: [
    {
      id: developmentTenantContext.workspaceId,
      name: "US Editorial",
      slug: "us-editorial",
      status: "active",
    },
  ],
};

export const developmentOverview: Overview = {
  metrics: {
    qualifiedClicks: 18_420,
    commissionAmount: 6_840,
    commissionCurrency: "USD",
    contentAwaitingReview: 7,
    publishingHealthPercent: 98.6,
  },
  opportunities: [
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
      productName: "Northline Thermal Mug",
      network: "awin",
      level: "high",
      score: 92,
      commissionRate: 8,
      averageCommission: 3.84,
      observedAt: "2026-07-25T09:00:00.000Z",
      freshnessTrend: "rising",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b102",
      productName: "Nomad 65W Travel Charger",
      network: "awin",
      level: "high",
      score: 87,
      commissionRate: 6,
      averageCommission: 7.19,
      observedAt: "2026-07-26T09:00:00.000Z",
      freshnessTrend: "new",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b103",
      productName: "Ridgeway Running Watch",
      network: "cj_affiliate",
      level: "medium",
      score: 74,
      commissionRate: 5,
      averageCommission: 16.49,
      observedAt: "2026-07-24T09:00:00.000Z",
      freshnessTrend: "steady",
    },
  ],
  queue: [
    {
      id: fixtureContentId,
      title: "Best Insulated Mugs for Commuters",
      subject: "Northline Thermal Mug",
      status: "needs_review",
      occurredAt: "2026-07-27T08:30:00.000Z",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b202",
      title: "65W Travel Charger Buying Guide",
      subject: "Nomad 65W Travel Charger",
      status: "ready_to_publish",
      occurredAt: "2026-07-27T07:00:00.000Z",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b203",
      title: "Reconnect Awin account",
      subject: "Awin",
      status: "needs_reconnect",
      occurredAt: "2026-07-27T04:00:00.000Z",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b204",
      title: "Running Watch Comparison Guide",
      subject: "Ridgeway Running Watch",
      status: "needs_review",
      occurredAt: "2026-07-26T09:00:00.000Z",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b205",
      title: "Travel Accessories Roundup",
      subject: "Northline Thermal Mug",
      status: "ready_to_publish",
      occurredAt: "2026-07-26T08:00:00.000Z",
    },
  ],
  pipeline: {
    draft: 14,
    inReview: 7,
    approved: 6,
    scheduled: 5,
    published: 128,
  },
  generatedAt: "2026-07-27T09:00:00.000Z",
};

export const developmentContentReview: ContentReview = {
  id: fixtureContentId,
  title: "Best Insulated Mugs for Commuters",
  status: "in_review",
  revision: 4,
  owner: "Casey Morgan",
  locale: "en-US",
  productName: "Northline Thermal Mug",
  network: "Awin",
  destination: "Northstar WordPress",
  disclosure:
    "This content contains affiliate links. The publisher may earn a commission from qualifying purchases at no additional cost to the reader.",
  introduction:
    "We compared authorized product specifications, observed prices, and merchant information for commuter-friendly insulated mugs. The Northline Thermal Mug stands out for its practical shape and documented insulation.",
  selectedClaim:
    "The merchant lists heat retention up to 6 hours and cold retention up to 12 hours.",
  validationChecks: [
    {
      key: "factual_grounding",
      label: "Factual grounding",
      result: "100%",
      status: "pass",
    },
    { key: "disclosure", label: "Disclosure", result: "Present", status: "pass" },
    {
      key: "prohibited_claims",
      label: "Prohibited claims",
      result: "None",
      status: "pass",
    },
    {
      key: "near_duplicate",
      label: "Near-duplicate risk",
      result: "Low",
      status: "pass",
    },
    { key: "link_policy", label: "Link policy", result: "Pass", status: "pass" },
  ],
  evidence: [
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b301",
      label: "Awin product feed",
      sourceType: "network_feed",
      observedAt: "2026-07-27T08:00:00.000Z",
    },
    {
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b302",
      label: "Merchant page",
      sourceType: "merchant_page",
      observedAt: "2026-07-26T17:00:00.000Z",
    },
  ],
  unresolvedComments: 2,
};
