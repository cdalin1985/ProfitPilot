import { describe, expect, it } from "vitest";
import { buildEventIngestionServer } from "./server.js";

describe("event ingestion authentication", () => {
  it("rejects unsigned input before parsing or database work", async () => {
    const server = await buildEventIngestionServer("a-service-auth-key-that-is-long-enough");
    const response = await server.inject({ method: "POST", url: "/internal/v1/click-events", headers: { "content-type": "application/json" }, payload: "{}" });
    expect(response.statusCode).toBe(401);
    await server.close();
  });
});
