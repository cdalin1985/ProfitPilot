import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedActor } from "@profit-pilot/contracts";
import { developmentSession } from "@profit-pilot/fixtures";

import type { ApplicationServices } from "./application-services.js";
import { loadConfig } from "./config.js";
import type { IdentityProvider } from "./identity.js";
import { buildServer } from "./server.js";

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
});
