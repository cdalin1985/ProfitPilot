import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("API configuration", () => {
  it("fails closed when production identity or database settings are absent", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow();
  });

  it("accepts complete production control-plane settings", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      AUTH_MODE: "oidc",
      AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
      AUTH_ISSUER: "https://identity.example.com/",
      AUTH_AUDIENCE: "profit-pilot",
      ALLOWED_ORIGINS: "https://app.example.com",
      DATABASE_URL: "postgresql://application:secret@database.example.com:5432/profit_pilot",
    });

    expect(config.AUTH_MODE).toBe("oidc");
    expect(config.NODE_ENV).toBe("production");
  });
});
