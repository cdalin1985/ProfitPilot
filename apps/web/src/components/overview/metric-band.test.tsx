import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricBand } from "./metric-band";

describe("MetricBand", () => {
  it("formats and labels operational metrics", () => {
    render(
      <MetricBand
        metrics={{
          qualifiedClicks: 18_420,
          commissionAmount: 6_840,
          commissionCurrency: "USD",
          commissionAvailable: true,
          contentAwaitingReview: 7,
          publishingHealthPercent: 98.6,
        }}
      />,
    );

    const summary = screen.getByRole("region", { name: "Performance summary" });
    expect(summary).toHaveTextContent("18,420");
    expect(summary).toHaveTextContent("$6,840");
    expect(summary).toHaveTextContent("98.6%");
    expect(screen.getByText("Content awaiting review")).toBeVisible();
  });

  it("labels metrics without a production source as unavailable", () => {
    render(
      <MetricBand
        metrics={{
          qualifiedClicks: 0,
          commissionAmount: 0,
          commissionCurrency: "USD",
          commissionAvailable: false,
          contentAwaitingReview: 0,
          publishingHealthPercent: null,
        }}
      />,
    );

    expect(screen.getAllByText("Not available")).toHaveLength(2);
  });
});
