import { describe, expect, it } from "vitest";

import { assertCan, AuthorizationError, can } from "./index.js";

describe("authorization policy", () => {
  it("allows owners to manage billing", () => {
    expect(can({ organizationRole: "owner", workspaceRole: null }, "billing:manage")).toBe(true);
  });

  it("prevents editors from managing members", () => {
    const context = { organizationRole: "member", workspaceRole: "editor" } as const;
    expect(can(context, "members:manage")).toBe(false);
    expect(() => assertCan(context, "members:manage")).toThrow(AuthorizationError);
  });

  it("allows client approvers to approve but not edit content", () => {
    const context = {
      organizationRole: "member",
      workspaceRole: "client_approver",
    } as const;
    expect(can(context, "content:approve")).toBe(true);
    expect(can(context, "content:edit")).toBe(false);
  });

  it("combines organization and workspace grants without widening either role", () => {
    const context = {
      organizationRole: "billing_admin",
      workspaceRole: "contributor",
    } as const;
    expect(can(context, "billing:manage")).toBe(true);
    expect(can(context, "content:edit")).toBe(true);
    expect(can(context, "content:approve")).toBe(false);
  });
});
