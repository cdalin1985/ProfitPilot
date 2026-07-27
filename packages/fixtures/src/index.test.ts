import { describe, expect, it } from "vitest";

import { contentReviewSchema, overviewSchema } from "@profit-pilot/contracts";

import { developmentContentReview, developmentOverview } from "./index.js";

describe("development fixtures", () => {
  it("stay synchronized with the public contracts", () => {
    expect(() => overviewSchema.parse(developmentOverview)).not.toThrow();
    expect(() => contentReviewSchema.parse(developmentContentReview)).not.toThrow();
  });
});
