import { describe, expect, it } from "vitest";

import { opportunityTrend, publishingHealth, subjectFromSourceSnapshot } from "./overview.js";

describe("production overview derivation", () => {
  it("does not fabricate publishing health without terminal attempts", () => {
    expect(publishingHealth([])).toBeNull();
    expect(
      publishingHealth([
        { status: "draft_created", total: 8 },
        { status: "failed", total: 2 },
        { status: "cancelled", total: 50 },
      ]),
    ).toBe(80);
  });

  it("derives a stable latest-score trend", () => {
    const now = new Date("2026-08-13T18:00:00.000Z");
    const established = new Date("2026-08-01T18:00:00.000Z");
    expect(opportunityTrend(80, 70, established, now)).toBe("rising");
    expect(opportunityTrend(65, 72, established, now)).toBe("falling");
    expect(opportunityTrend(73, 72, established, now)).toBe("steady");
    expect(opportunityTrend(73, null, established, now)).toBe("new");
  });

  it("reads product subjects only from the immutable fact snapshot", () => {
    expect(
      subjectFromSourceSnapshot({ facts: [{ id: "product.name", value: "  Travel Mug  " }] }),
    ).toBe("Travel Mug");
    expect(subjectFromSourceSnapshot({ productName: "Untrusted shortcut" })).toBe(
      "Editorial content",
    );
  });
});
