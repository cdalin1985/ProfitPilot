import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  affiliateConnections,
  auditEvents,
  contentItems,
  contentGenerationRequests,
  contentReviewActions,
  contentRevisions,
  evidenceRecords,
  feedSyncStates,
  onboardingRequests,
  opportunities,
  products,
  publications,
  workspaceMemberships,
  workspaceOnboardingSteps,
} from "./schema.js";

describe("tenant-owned database tables", () => {
  it.each([
    ["affiliateConnections", affiliateConnections],
    ["contentGenerationRequests", contentGenerationRequests],
    ["contentReviewActions", contentReviewActions],
    ["feedSyncStates", feedSyncStates],
    ["products", products],
    ["opportunities", opportunities],
    ["contentItems", contentItems],
    ["contentRevisions", contentRevisions],
    ["evidenceRecords", evidenceRecords],
    ["publications", publications],
    ["auditEvents", auditEvents],
    ["workspaceMemberships", workspaceMemberships],
    ["workspaceOnboardingSteps", workspaceOnboardingSteps],
  ])("%s carries an organization boundary", (_name, table) => {
    expect(getTableColumns(table)).toHaveProperty("organizationId");
  });

  it("keeps pre-tenant onboarding requests scoped to an authenticated identity", () => {
    expect(getTableColumns(onboardingRequests)).toHaveProperty("externalIdentityId");
    expect(getTableColumns(onboardingRequests)).toHaveProperty("idempotencyKey");
  });
});
