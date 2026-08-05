import { describe, expect, it, vi } from "vitest";

import { AwinAuthenticationError, AwinUnavailableError, createAwinClient } from "./awin.js";

describe("Awin client", () => {
  it("authenticates with a bearer token and validates publishers", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify([{ publisherId: 1234, name: "Northstar Media" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const publishers = await createAwinClient(fetchImplementation).listPublishers("secret-token");

    expect(publishers).toEqual([{ publisherId: 1234, name: "Northstar Media" }]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.awin.com/publishers",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret-token" }),
      }),
    );
  });

  it("maps rejected credentials without including the token", async () => {
    const client = createAwinClient(vi.fn(async () => new Response(null, { status: 401 })));
    const error = await client.listPublishers("never-log-this").catch((value) => value);

    expect(error).toBeInstanceOf(AwinAuthenticationError);
    expect(String(error)).not.toContain("never-log-this");
  });

  it("fails closed on malformed upstream data", async () => {
    const client = createAwinClient(
      vi.fn(async () => new Response(JSON.stringify([{ unexpected: true }]), { status: 200 })),
    );

    await expect(client.listPublishers("token")).rejects.toBeInstanceOf(AwinUnavailableError);
  });
});
