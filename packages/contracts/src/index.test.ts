import { describe, expect, it } from "vitest";

import {
  createContentDraftSchema,
  createOrganizationWorkspaceSchema,
  importAwinFeedSchema,
  opportunitySchema,
  problemDetailsSchema,
  configureWordPressDestinationSchema,
  createWordPressDraftSchema,
  tenantContextSchema,
} from "./index.js";

describe("public contracts", () => {
  it("rejects opportunity scores outside the supported range", () => {
    const result = opportunitySchema.safeParse({
      id: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
      productName: "Northline Thermal Mug",
      network: "awin",
      level: "high",
      score: 101,
      commissionRate: 8,
      averageCommission: 3.84,
      observedAt: "2026-07-25T09:00:00.000Z",
      freshnessTrend: "rising",
    });

    expect(result.success).toBe(false);
  });

  it("accepts RFC 9457-style problem details", () => {
    expect(
      problemDetailsSchema.parse({
        type: "https://profitpilot.app/problems/forbidden",
        title: "Insufficient permission",
        status: 403,
        requestId: "request-123",
      }),
    ).toMatchObject({ status: 403, requestId: "request-123" });
  });

  it("validates an explicit organization and workspace profile", () => {
    expect(
      createOrganizationWorkspaceSchema.parse({
        organizationName: "Northstar Media",
        workspace: {
          name: "US Editorial",
          targetCountry: "us",
          defaultLanguage: "EN",
          locale: "en-US",
          currency: "USD",
          timezone: "America/Denver",
          niche: "Consumer technology",
        },
      }),
    ).toMatchObject({
      organizationName: "Northstar Media",
      workspace: {
        targetCountry: "US",
        defaultLanguage: "en",
      },
    });
  });

  it("rejects unsupported currency and timezone values", () => {
    expect(() =>
      createOrganizationWorkspaceSchema.parse({
        organizationName: "Northstar Media",
        workspace: {
          name: "US Editorial",
          targetCountry: "US",
          defaultLanguage: "en",
          locale: "en-US",
          currency: "ZZZ",
          timezone: "Mars/Olympus",
          niche: "Consumer technology",
        },
      }),
    ).toThrow();
  });

  it("rejects invented country codes and accepts UTC", () => {
    expect(() =>
      createOrganizationWorkspaceSchema.parse({
        organizationName: "Northstar Media",
        workspace: {
          name: "Global Editorial",
          targetCountry: "ZZ",
          defaultLanguage: "en",
          locale: "en-US",
          currency: "USD",
          timezone: "UTC",
          niche: "Consumer technology",
        },
      }),
    ).toThrow();

    expect(
      createOrganizationWorkspaceSchema.parse({
        organizationName: "Northstar Media",
        workspace: {
          name: "Global Editorial",
          targetCountry: "US",
          defaultLanguage: "en",
          locale: "en-US",
          currency: "USD",
          timezone: "UTC",
          niche: "Consumer technology",
        },
      }).workspace.timezone,
    ).toBe("UTC");
  });

  it("keeps organization and workspace roles distinct in tenant context", () => {
    expect(() =>
      tenantContextSchema.parse({
        organizationId: "018f6d4d-74d4-7c18-a1d4-bb620a63b001",
        workspaceId: "018f6d4d-74d4-7c18-a1d4-bb620a63b002",
        userId: "018f6d4d-74d4-7c18-a1d4-bb620a63b003",
        organizationRole: "editor",
        workspaceRole: null,
      }),
    ).toThrow();
  });

  it("validates Awin feed identifiers and canonical locales", () => {
    expect(
      importAwinFeedSchema.parse({
        connectionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
        publisherId: 1234,
        advertiserId: 5678,
        locale: "en_US",
        commissionRate: 8.5,
      }),
    ).toMatchObject({ locale: "en_US", commissionRate: 8.5 });

    expect(() =>
      importAwinFeedSchema.parse({
        connectionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
        publisherId: 1234,
        advertiserId: 5678,
        locale: "english_US",
      }),
    ).toThrow();
  });

  it("validates a bounded content brief and canonical locale", () => {
    expect(
      createContentDraftSchema.parse({
        opportunityId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
        title: "Best insulated mugs for commuters",
        contentType: "article",
        locale: "en-us",
        brief: {
          audience: "Daily rail commuters",
          angle: "Compare only evidence-backed practical features",
          tone: "practical",
        },
      }),
    ).toMatchObject({ locale: "en-US", contentType: "article" });
  });

  it("accepts secret references for WordPress drafts while rejecting raw or malformed inputs", () => {
    expect(
      configureWordPressDestinationSchema.parse({
        name: "Northstar WordPress",
        siteUrl: "https://publisher.example.com",
        secretReference: "profit-pilot/test/wordpress",
      }),
    ).toMatchObject({ secretReference: "profit-pilot/test/wordpress" });
    expect(() =>
      configureWordPressDestinationSchema.parse({
        name: "Northstar WordPress",
        siteUrl: "https://publisher.example.com",
        secretReference: "invalid\nreference",
      }),
    ).toThrow();
    expect(() =>
      createWordPressDraftSchema.parse({ destinationId: "not-a-uuid", revisionId: "also-not" }),
    ).toThrow();
  });
});
