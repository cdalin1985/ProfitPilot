import { describe, expect, it } from "vitest";

import { mandatoryValidationPasses } from "./content-review.js";

const passingChecks = [
  { key: "factual_grounding", label: "Grounding", result: "Pass", status: "pass" },
  { key: "disclosure", label: "Disclosure", result: "Present", status: "pass" },
  { key: "prohibited_claims", label: "Claims", result: "None", status: "pass" },
  { key: "near_duplicate", label: "Duplicate", result: "Low", status: "warning" },
  { key: "link_policy", label: "Links", result: "Pass", status: "pass" },
];

describe("mandatoryValidationPasses", () => {
  it("allows warnings when all mandatory checks are present", () => {
    expect(mandatoryValidationPasses({ checks: passingChecks })).toBe(true);
  });

  it("blocks a failed mandatory check", () => {
    expect(
      mandatoryValidationPasses({
        checks: passingChecks.map((check) =>
          check.key === "disclosure" ? { ...check, status: "fail" } : check,
        ),
      }),
    ).toBe(false);
  });

  it("blocks missing and malformed validation snapshots", () => {
    expect(mandatoryValidationPasses({ checks: passingChecks.slice(0, -1) })).toBe(false);
    expect(mandatoryValidationPasses({ checks: "pass" })).toBe(false);
  });
});
