import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedActor } from "@profit-pilot/contracts";
import { developmentContentReview, developmentSession } from "@profit-pilot/fixtures";

import type { ApplicationServices } from "./application-services.js";
import type { ContentGenerationService } from "./content-generation.js";
import type { ContentReviewService } from "./content-review.js";
import { loadConfig } from "./config.js";
import type { IdentityProvider } from "./identity.js";
import { buildServer } from "./server.js";
import type { AwinClient } from "./awin.js";
import type { ProductIngestionService } from "./product-ingestion.js";

const testConfig = () =>
  loadConfig({ NODE_ENV: "test", AUTH_MODE: "development", LOG_LEVEL: "silent" });

const testActor: AuthenticatedActor = {
  externalIdentityId: "user_test",
  sessionId: "session_test",
};

const testIdentityProvider: IdentityProvider = {
  async authenticate() {
    return testActor;
  },
};

function testServices(overrides: Partial<ApplicationServices> = {}): ApplicationServices {
  return {
    async getSession() {
      return developmentSession;
    },
    async resolveTenant() {
      return developmentSession.tenant;
    },
    async createOrganizationWorkspace() {
      return {
        ...developmentSession.active,
        replayed: false,
      };
    },
    ...overrides,
  };
}

describe("API server", () => {
  it("reports liveness without authentication", async () => {
    const server = await buildServer({
      config: testConfig(),
    });

    const response = await server.inject({ method: "GET", url: "/health/live" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns the tenant-scoped development overview", async () => {
    const server = await buildServer({
      config: testConfig(),
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/workspaces/018f6d4d-74d4-7c18-a1d4-bb620a63b002/overview",
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().metrics.qualifiedClicks).toBe(18_420);
  });

  it("rejects cross-workspace requests", async () => {
    const server = await buildServer({
      config: testConfig(),
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/workspaces/018f6d4d-74d4-7c18-a1d4-bb620a63b999/overview",
    });
    await server.close();

    expect(response.statusCode).toBe(403);
  });

  it("returns unavailable when a required dependency fails readiness", async () => {
    const server = await buildServer({
      config: testConfig(),
      readinessProbe: async () => {
        throw new Error("database unavailable");
      },
    });

    const response = await server.inject({ method: "GET", url: "/health/ready" });
    await server.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      dependencies: { database: "unavailable" },
    });
  });

  it("uses problem details for unknown routes", async () => {
    const server = await buildServer({ config: testConfig() });

    const response = await server.inject({ method: "GET", url: "/unknown" });
    await server.close();

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
  });

  it("creates an organization workspace with an authenticated actor and idempotency key", async () => {
    const createOrganizationWorkspace = vi.fn(testServices().createOrganizationWorkspace);
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices({ createOrganizationWorkspace }),
    });

    const idempotencyKey = "018f6d4d-74d4-7c18-a1d4-bb620a63f001";
    const response = await server.inject({
      method: "POST",
      url: "/v1/onboarding/organization-workspace",
      headers: { "idempotency-key": idempotencyKey },
      payload: {
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
      },
    });
    await server.close();

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(
      `/v1/workspaces/${developmentSession.active.workspace.id}`,
    );
    expect(createOrganizationWorkspace).toHaveBeenCalledWith(
      testActor,
      expect.objectContaining({
        organizationName: "Northstar Media",
        workspace: expect.objectContaining({
          targetCountry: "US",
          defaultLanguage: "en",
        }),
      }),
      expect.objectContaining({ idempotencyKey }),
    );
  });

  it("rejects onboarding before any provisioning when the request is invalid", async () => {
    const createOrganizationWorkspace = vi.fn(testServices().createOrganizationWorkspace);
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices({ createOrganizationWorkspace }),
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/onboarding/organization-workspace",
      payload: { organizationName: "" },
    });
    await server.close();

    expect(response.statusCode).toBe(422);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(createOrganizationWorkspace).not.toHaveBeenCalled();
  });

  it("runs a tenant-authorized read-only Awin connection test", async () => {
    const listPublishers = vi.fn(async () => [{ publisherId: 1234, name: "Northstar Media" }]);
    const awinClient: AwinClient = {
      listPublishers,
      async downloadEnhancedFeed() {
        return { status: "not_modified" };
      },
    };
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices(),
      awinClient,
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${developmentSession.tenant.workspaceId}/connections/awin/test`,
      payload: { accessToken: "a-secure-connection-token" },
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "awin",
      status: "verified",
      publishers: [{ publisherId: 1234, name: "Northstar Media" }],
    });
    expect(listPublishers).toHaveBeenCalledWith("a-secure-connection-token");
  });

  it("runs a tenant-authorized Awin product import", async () => {
    const importAwinFeed = vi.fn(async () => ({
      provider: "awin" as const,
      status: "ingested" as const,
      feed: { publisherId: 1234, advertiserId: 5678, locale: "en_US" },
      products: { received: 2, accepted: 2, rejected: 0 },
      nextEligibleAt: "2026-08-05T12:15:00.000Z",
      completedAt: "2026-08-05T12:00:00.000Z",
    }));
    const productIngestionService: ProductIngestionService = { importAwinFeed };
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices(),
      productIngestionService,
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${developmentSession.tenant.workspaceId}/connections/awin/imports`,
      payload: {
        connectionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
        publisherId: 1234,
        advertiserId: 5678,
        locale: "en_US",
      },
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().products).toEqual({ received: 2, accepted: 2, rejected: 0 });
    expect(importAwinFeed).toHaveBeenCalledWith(
      developmentSession.tenant,
      expect.objectContaining({ connectionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101" }),
    );
  });

  it("creates an idempotent tenant-authorized grounded content draft", async () => {
    const createDraft = vi.fn(async () => ({
      contentId: "018f6d4d-74d4-7c18-a1d4-bb620a63b201",
      revisionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b202",
      status: "in_review" as const,
      revision: 1,
      validationChecks: [
        {
          key: "factual_grounding" as const,
          label: "Factual grounding",
          result: "Pass",
          status: "pass" as const,
        },
        {
          key: "disclosure" as const,
          label: "Disclosure",
          result: "Present",
          status: "pass" as const,
        },
        {
          key: "prohibited_claims" as const,
          label: "Prohibited claims",
          result: "None",
          status: "pass" as const,
        },
        {
          key: "near_duplicate" as const,
          label: "Near-duplicate risk",
          result: "Low",
          status: "pass" as const,
        },
        {
          key: "link_policy" as const,
          label: "Link policy",
          result: "Pass",
          status: "pass" as const,
        },
      ],
      evidenceCount: 3,
      promptVersion: "openai-grounded-v1.0.0",
      generatedAt: "2026-08-05T12:00:00.000Z",
      replayed: false,
    }));
    const contentGenerationService: ContentGenerationService = { createDraft };
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices(),
      contentGenerationService,
    });
    const idempotencyKey = "018f6d4d-74d4-7c18-a1d4-bb620a63f201";

    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${developmentSession.tenant.workspaceId}/content/drafts`,
      headers: { "idempotency-key": idempotencyKey },
      payload: {
        opportunityId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
        title: "Best insulated mugs for commuters",
        contentType: "article",
        locale: "en-US",
        brief: {
          audience: "Daily rail commuters",
          angle: "Practical evidence-backed features",
          tone: "practical",
        },
      },
    });
    await server.close();

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe("/v1/content/018f6d4d-74d4-7c18-a1d4-bb620a63b201");
    expect(createDraft).toHaveBeenCalledWith(
      developmentSession.tenant,
      expect.objectContaining({ contentType: "article", locale: "en-US" }),
      idempotencyKey,
    );
  });

  it("reads a tenant-scoped persisted content review", async () => {
    const get = vi.fn(async () => developmentContentReview);
    const contentReviewService: ContentReviewService = {
      get,
      async requestChanges() {
        throw new Error("unused");
      },
      async approve() {
        throw new Error("unused");
      },
    };
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices(),
      contentReviewService,
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/content/${developmentContentReview.id}`,
      headers: { "x-workspace-id": developmentSession.tenant.workspaceId },
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().revisionId).toBe(developmentContentReview.revisionId);
    expect(get).toHaveBeenCalledWith(developmentSession.tenant, developmentContentReview.id);
  });

  it("records an idempotent approval against the current revision", async () => {
    const approve = vi.fn(async () => ({
      contentId: developmentContentReview.id,
      revisionId: developmentContentReview.revisionId,
      actionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b299",
      action: "approved" as const,
      status: "approved" as const,
      actedAt: "2026-08-05T12:00:00.000Z",
      replayed: false,
    }));
    const contentReviewService: ContentReviewService = {
      async get() {
        return developmentContentReview;
      },
      async requestChanges() {
        throw new Error("unused");
      },
      approve,
    };
    const server = await buildServer({
      config: testConfig(),
      identityProvider: testIdentityProvider,
      services: testServices(),
      contentReviewService,
    });
    const idempotencyKey = "018f6d4d-74d4-7c18-a1d4-bb620a63f299";

    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${developmentSession.tenant.workspaceId}/content/${developmentContentReview.id}/review/approve`,
      headers: { "idempotency-key": idempotencyKey },
      payload: { revisionId: developmentContentReview.revisionId },
    });
    await server.close();

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("approved");
    expect(approve).toHaveBeenCalledWith(
      developmentSession.tenant,
      developmentContentReview.id,
      { revisionId: developmentContentReview.revisionId },
      idempotencyKey,
    );
  });
});
