import { describe, expect, it, vi } from "vitest";

import {
  createWordPressClient,
  resolveSafeWordPressUrl,
  UnsafeWordPressTargetError,
  WordPressAuthenticationError,
  WordPressDraftConflictError,
  type WordPressTransport,
} from "./wordpress.js";

const credentials = {
  username: "publisher",
  applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
};

function transportWith(...responses: { status: number; body: unknown }[]): {
  transport: WordPressTransport;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected request");
    return response;
  });
  return { transport: { request }, request };
}

describe("WordPress client", () => {
  it("rejects non-HTTPS and private or rebinding targets", async () => {
    await expect(
      resolveSafeWordPressUrl("http://publisher.example.com", async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafeWordPressTargetError);
    await expect(
      resolveSafeWordPressUrl("https://publisher.example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafeWordPressTargetError);
  });

  it("pins a public destination and returns the verified WordPress user", async () => {
    await expect(
      resolveSafeWordPressUrl("https://publisher.example.com", async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).resolves.toMatchObject({ address: "93.184.216.34", family: 4 });
    const fake = transportWith({ status: 200, body: { id: 42, name: "Publisher Bot" } });
    const client = createWordPressClient(fake.transport);

    await expect(client.verify("https://publisher.example.com", credentials)).resolves.toEqual({
      id: 42,
      name: "Publisher Bot",
    });
    const calledUrl = fake.request.mock.calls[0]?.[0] as URL;
    expect(calledUrl.pathname).toBe("/wp-json/wp/v2/users/me");
    expect(calledUrl.searchParams.get("context")).toBe("edit");
  });

  it("maps invalid Application Password credentials without exposing them", async () => {
    const fake = transportWith({ status: 401, body: { code: "rest_not_logged_in" } });
    const client = createWordPressClient(fake.transport);
    const error = await client
      .verify("https://publisher.example.com", credentials)
      .catch((value) => value);
    expect(error).toBeInstanceOf(WordPressAuthenticationError);
    expect(String(error)).not.toContain(credentials.applicationPassword);
  });

  it("reuses a deterministic existing draft without creating another post", async () => {
    const fake = transportWith({
      status: 200,
      body: [
        {
          id: 91,
          slug: "commuter-mug-aabbcc",
          status: "draft",
          link: "https://publisher.example.com/?p=91",
        },
      ],
    });
    const client = createWordPressClient(fake.transport);
    const result = await client.ensureDraft({
      siteUrl: "https://publisher.example.com",
      credentials,
      title: "Commuter mug",
      content: "<!-- wp:paragraph --><p>Draft</p><!-- /wp:paragraph -->",
      slug: "commuter-mug-aabbcc",
    });

    expect(result).toMatchObject({ id: "91", status: "draft", reused: true });
    expect(fake.request).toHaveBeenCalledOnce();
  });

  it("creates only a remote draft after the deterministic lookup misses", async () => {
    const fake = transportWith(
      { status: 200, body: [] },
      {
        status: 201,
        body: {
          id: 92,
          slug: "commuter-mug-aabbcc",
          status: "draft",
          link: "https://publisher.example.com/?p=92",
        },
      },
    );
    const client = createWordPressClient(fake.transport);
    const result = await client.ensureDraft({
      siteUrl: "https://publisher.example.com",
      credentials,
      title: "Commuter mug",
      content: "<p>Draft</p>",
      slug: "commuter-mug-aabbcc",
    });

    expect(result).toMatchObject({ id: "92", status: "draft", reused: false });
    const createCall = fake.request.mock.calls[1];
    expect(createCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ status: "draft" });
  });

  it("refuses to reuse a deterministic post that is no longer a draft", async () => {
    const fake = transportWith({
      status: 200,
      body: [
        {
          id: 93,
          slug: "commuter-mug-aabbcc",
          status: "publish",
          link: "https://publisher.example.com/commuter-mug-aabbcc",
        },
      ],
    });
    const client = createWordPressClient(fake.transport);
    await expect(
      client.ensureDraft({
        siteUrl: "https://publisher.example.com",
        credentials,
        title: "Commuter mug",
        content: "<p>Draft</p>",
        slug: "commuter-mug-aabbcc",
      }),
    ).rejects.toBeInstanceOf(WordPressDraftConflictError);
  });
});
