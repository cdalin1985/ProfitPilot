import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  createOrganizationAction: vi.fn(async (state) => state),
}));

import { OnboardingForm } from "./onboarding-form";

const options = [{ value: "US", label: "United States of America" }];

describe("OnboardingForm", () => {
  it("renders a labeled, production-safe organization and workspace form", () => {
    render(
      <OnboardingForm
        countries={options}
        currencies={[{ value: "USD", label: "USD — US Dollar" }]}
        idempotencyKey="018f6d4d-74d4-7c18-a1d4-bb620a63f001"
        languages={[{ value: "en", label: "English" }]}
        timezones={[{ value: "America/Denver", label: "America/Denver" }]}
      />,
    );

    expect(screen.getByLabelText("Organization name")).toBeRequired();
    expect(screen.getByLabelText("Workspace name")).toBeRequired();
    expect(screen.getByLabelText("Primary market")).toHaveValue("US");
    expect(screen.getByLabelText("Content language")).toHaveValue("en");
    expect(screen.getByLabelText("Formatting locale")).toHaveValue("en-US");
    expect(screen.getByLabelText("Reporting currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Operating timezone")).toHaveValue("America/Denver");
    expect(screen.getByLabelText("Primary niche")).toBeRequired();
    expect(screen.getByText("No external actions happen yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create workspace/i })).toBeEnabled();
  });
});
