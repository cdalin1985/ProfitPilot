import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRedirectServer } from "./server.js";

describe("redirect boundary", () => {
  it("fails closed without disclosing why a token is invalid", async () => {
    const key = randomBytes(32).toString("base64url");
    const server = await buildRedirectServer({
      signingKeys: { test: key },
      privacyKey: key,
      privacyKeyId: "test",
      eventAuthKey: key,
      ingestionUrl: "https://events.example.test/internal/v1/click-events",
    });
    const response = await server.inject({ method: "GET", url: "/r/not-a-token" });
    expect(response.statusCode).toBe(404);
    expect(response.body).toBe("Link unavailable");
    expect(response.headers["cache-control"]).toBe("no-store");
    await server.close();
  });
});
