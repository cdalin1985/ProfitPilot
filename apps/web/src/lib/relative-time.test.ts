import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const generatedAt = "2026-08-13T12:00:00.000Z";

  it("uses the server snapshot time rather than the browser clock", () => {
    expect(relativeTime("2026-08-13T11:59:30.000Z", generatedAt)).toBe("Just now");
    expect(relativeTime("2026-08-13T11:15:00.000Z", generatedAt)).toBe("45m ago");
    expect(relativeTime("2026-08-12T10:00:00.000Z", generatedAt)).toBe("1d ago");
  });

  it("does not show negative elapsed time for clock skew", () => {
    expect(relativeTime("2026-08-13T12:01:00.000Z", generatedAt)).toBe("Just now");
  });
});
