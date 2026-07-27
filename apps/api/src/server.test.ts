import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const testConfig = () =>
  loadConfig({ NODE_ENV: "test", AUTH_MODE: "development", LOG_LEVEL: "silent" });

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
});
