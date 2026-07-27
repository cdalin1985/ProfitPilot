import { describe, expect, it } from "vitest";

import { opportunitySchema, problemDetailsSchema } from "./index.js";

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
});
