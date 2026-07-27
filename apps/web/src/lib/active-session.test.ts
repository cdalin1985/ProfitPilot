import { beforeEach, describe, expect, it, vi } from "vitest";

import { developmentSession } from "@profit-pilot/fixtures";

const mocks = vi.hoisted(() => ({
  getActiveWorkspaceId: vi.fn<() => Promise<string | undefined>>(),
  getApplicationSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./workspace-cookie", () => ({
  getActiveWorkspaceId: mocks.getActiveWorkspaceId,
}));
vi.mock("./profit-pilot-api", () => ({
  ProfitPilotApiError: class ProfitPilotApiError extends Error {
    constructor(
      readonly status: number,
      readonly problem: unknown,
    ) {
      super("Profit Pilot API error");
    }
  },
  getApplicationSession: mocks.getApplicationSession,
}));

import { getActiveWorkspaceSession } from "./active-session";
import { ProfitPilotApiError } from "./profit-pilot-api";

const auth = {
  user: {
    id: "user_test",
    email: "owner@example.com",
    displayName: "Test Owner",
    initials: "TO",
  },
  sessionId: "session_test",
};

describe("getActiveWorkspaceSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the application session for the selected workspace", async () => {
    mocks.getActiveWorkspaceId.mockResolvedValue(developmentSession.tenant.workspaceId);
    mocks.getApplicationSession.mockResolvedValue(developmentSession);

    await expect(getActiveWorkspaceSession(auth)).resolves.toEqual(developmentSession);
    expect(mocks.getApplicationSession).toHaveBeenCalledWith(
      auth,
      developmentSession.tenant.workspaceId,
    );
  });

  it("recovers from a stale workspace selection after access is denied", async () => {
    mocks.getActiveWorkspaceId.mockResolvedValue(developmentSession.tenant.workspaceId);
    mocks.getApplicationSession.mockRejectedValue(
      new ProfitPilotApiError(403, {
        type: "https://profitpilot.app/problems/tenant-access-denied",
        title: "Tenant access denied",
        status: 403,
      }),
    );

    await expect(getActiveWorkspaceSession(auth)).rejects.toThrow("NEXT_REDIRECT:/session/recover");
    expect(mocks.redirect).toHaveBeenCalledWith("/session/recover");
  });

  it("does not hide upstream failures", async () => {
    mocks.getActiveWorkspaceId.mockResolvedValue(developmentSession.tenant.workspaceId);
    const failure = new ProfitPilotApiError(503, {
      type: "https://profitpilot.app/problems/upstream-response",
      title: "Service unavailable",
      status: 503,
    });
    mocks.getApplicationSession.mockRejectedValue(failure);

    await expect(getActiveWorkspaceSession(auth)).rejects.toBe(failure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
