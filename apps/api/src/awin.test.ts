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

  it("downloads and validates an enhanced JSONL feed with conditional headers", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          [
            JSON.stringify({ id: "sku-1", title: "Travel charger", price: "49.00 USD" }),
            JSON.stringify({ id: "sku-2", title: "Thermal mug", price: "32.00 USD" }),
          ].join("\n"),
          {
            status: 200,
            headers: {
              etag: '"feed-v2"',
              "last-modified": "Wed, 05 Aug 2026 12:00:00 GMT",
            },
          },
        ),
    );
    const result = await createAwinClient(fetchImplementation).downloadEnhancedFeed({
      accessToken: "secret-token",
      publisherId: 1234,
      advertiserId: 5678,
      locale: "en_US",
      ifNoneMatch: '"feed-v1"',
    });

    expect(result).toMatchObject({ status: "downloaded", etag: '"feed-v2"' });
    if (result.status === "downloaded") expect(result.products).toHaveLength(2);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.awin.com/publishers/1234/awinfeeds/download/5678-retail-en_US.jsonl",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer secret-token",
          "if-none-match": '"feed-v1"',
        }),
      }),
    );
  });

  it("fails the whole download when Awin ends JSONL with an error object", async () => {
    const body = [
      JSON.stringify({ id: "sku-1", title: "Travel charger", price: "49.00 USD" }),
      JSON.stringify({ error: 500, message: "Incomplete feed" }),
    ].join("\n");
    const client = createAwinClient(vi.fn(async () => new Response(body, { status: 200 })));

    await expect(
      client.downloadEnhancedFeed({
        accessToken: "secret-token",
        publisherId: 1234,
        advertiserId: 5678,
        locale: "en_US",
      }),
    ).rejects.toMatchObject({ code: "awin_feed_invalid" });
  });

  it("recognizes an unchanged feed without reading a body", async () => {
    const client = createAwinClient(vi.fn(async () => new Response(null, { status: 304 })));
    await expect(
      client.downloadEnhancedFeed({
        accessToken: "secret-token",
        publisherId: 1234,
        advertiserId: 5678,
        locale: "en_US",
      }),
    ).resolves.toEqual({ status: "not_modified" });
  });
});
