import { describe, expect, it } from "vitest";

import { assertCan, AuthorizationError, can } from "./index.js";

describe("authorization policy", () => {
  it("allows owners to manage billing", () => {
    expect(can("owner", "billing:manage")).toBe(true);
  });

  it("prevents editors from managing members", () => {
    expect(can("editor", "members:manage")).toBe(false);
    expect(() => assertCan("editor", "members:manage")).toThrow(AuthorizationError);
  });

  it("allows client approvers to approve but not edit content", () => {
    expect(can("client_approver", "content:approve")).toBe(true);
    expect(can("client_approver", "content:edit")).toBe(false);
  });
});
