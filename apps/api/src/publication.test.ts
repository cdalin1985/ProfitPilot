import { describe, expect, it, vi } from "vitest";

import { developmentSession } from "@profit-pilot/fixtures";

import { createPublicationService, renderGutenbergArticle } from "./publication.js";
import type { WordPressCredentialResolver } from "./secrets.js";

const contentId = "018f6d4d-74d4-7c18-a1d4-bb620a63d101";
const revisionId = "018f6d4d-74d4-7c18-a1d4-bb620a63d102";
const destinationId = "018f6d4d-74d4-7c18-a1d4-bb620a63d103";
const publicationId = "018f6d4d-74d4-7c18-a1d4-bb620a63d104";
const credentials = { username: "publisher", applicationPassword: "abcd efgh ijkl mnop qrst uvwx" };

const credentialResolver: WordPressCredentialResolver = {
  async resolveCredentials() {
    return credentials;
  },
};

describe("WordPress publication service", () => {
  it("renders escaped Gutenberg blocks from the grounded revision", () => {
    const html = renderGutenbergArticle({
      disclosure: "Affiliate <disclosure>",
      introduction: [{ text: "Merchant says 6 & 12 hours." }],
      sections: [{ heading: "Why it works", claims: [{ text: "Documented > assumed." }] }],
      cta: { text: "Check merchant details." },
    });
    expect(html).toContain("<!-- wp:heading -->");
    expect(html).toContain("Affiliate &lt;disclosure&gt;");
    expect(html).toContain("6 &amp; 12 hours");
    expect(html).not.toContain("<disclosure>");
  });

  it("verifies credentials before storing only the destination reference", async () => {
    const verify = vi.fn(async () => ({ id: 42, name: "Publisher Bot" }));
    const saveDestination = vi.fn(async (_context, input, verifiedAt: Date) => ({
      id: destinationId,
      type: "wordpress" as const,
      name: input.name,
      siteUrl: input.siteUrl,
      status: "active" as const,
      verifiedAt: verifiedAt.toISOString(),
    }));
    const service = createPublicationService({
      configured: true,
      client: {
        verify,
        async ensureDraft() {
          throw new Error("unused");
        },
      },
      credentialResolver,
      repository: {
        saveDestination,
        async reserve() {
          throw new Error("unused");
        },
        async complete() {
          throw new Error("unused");
        },
        async fail() {},
      },
      now: () => new Date("2026-08-11T12:00:00.000Z"),
    });
    const result = await service.configureDestination(developmentSession.tenant, {
      name: "Northstar WordPress",
      siteUrl: "https://publisher.example.com/",
      secretReference: "profit-pilot/test/wordpress",
    });

    expect(result.siteUrl).toBe("https://publisher.example.com");
    expect(verify).toHaveBeenCalledWith("https://publisher.example.com", credentials);
    expect(saveDestination).toHaveBeenCalledWith(
      developmentSession.tenant,
      expect.objectContaining({ secretReference: "profit-pilot/test/wordpress" }),
      expect.any(Date),
    );
    expect(JSON.stringify(saveDestination.mock.calls)).not.toContain(
      credentials.applicationPassword,
    );
  });

  it("publishes once and records remote completion through the active lease", async () => {
    const reservation = {
      replayed: false as const,
      publicationId,
      contentId,
      revisionId,
      destinationId,
      siteUrl: "https://publisher.example.com",
      secretReference: "profit-pilot/test/wordpress",
      title: "Best commuter mug",
      body: { disclosure: "Affiliate disclosure", introduction: [{ text: "Grounded claim" }] },
      remoteSlug: "best-commuter-mug-018f6d4d74d4",
      leaseToken: "lease-token",
    };
    const remote = {
      id: "92",
      slug: reservation.remoteSlug,
      status: "draft" as const,
      url: "https://publisher.example.com/?p=92",
      reused: false,
    };
    const complete = vi.fn(async () => ({
      publicationId,
      contentId,
      revisionId,
      destinationId,
      status: "draft_created" as const,
      remotePostId: "92",
      remoteSlug: remote.slug,
      remoteUrl: remote.url,
      createdAt: "2026-08-11T12:00:00.000Z",
      replayed: false,
    }));
    const ensureDraft = vi.fn(async () => remote);
    const service = createPublicationService({
      configured: true,
      client: {
        async verify() {
          throw new Error("unused");
        },
        ensureDraft,
      },
      credentialResolver,
      repository: {
        async saveDestination() {
          throw new Error("unused");
        },
        async reserve() {
          return reservation;
        },
        complete,
        async fail() {},
      },
    });
    const result = await service.createDraft(
      developmentSession.tenant,
      contentId,
      { destinationId, revisionId },
      "018f6d4d-74d4-7c18-a1d4-bb620a63f501",
    );

    expect(result.status).toBe("draft_created");
    expect(ensureDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: reservation.remoteSlug, credentials }),
    );
    expect(complete).toHaveBeenCalledWith(developmentSession.tenant, reservation, remote);
  });

  it("records a terminal attempt failure without swallowing the provider error", async () => {
    const providerError = Object.assign(new Error("provider down"), { code: "provider_down" });
    const fail = vi.fn(async () => undefined);
    const service = createPublicationService({
      configured: true,
      client: {
        async verify() {
          throw new Error("unused");
        },
        async ensureDraft() {
          throw providerError;
        },
      },
      credentialResolver,
      repository: {
        async saveDestination() {
          throw new Error("unused");
        },
        async reserve() {
          return {
            replayed: false as const,
            publicationId,
            contentId,
            revisionId,
            destinationId,
            siteUrl: "https://publisher.example.com",
            secretReference: "profit-pilot/test/wordpress",
            title: "Best commuter mug",
            body: { disclosure: "Affiliate disclosure" },
            remoteSlug: "best-commuter-mug-018f6d4d74d4",
            leaseToken: "lease-token",
          };
        },
        async complete() {
          throw new Error("unused");
        },
        fail,
      },
    });

    await expect(
      service.createDraft(
        developmentSession.tenant,
        contentId,
        { destinationId, revisionId },
        "018f6d4d-74d4-7c18-a1d4-bb620a63f502",
      ),
    ).rejects.toBe(providerError);
    expect(fail).toHaveBeenCalledWith(
      developmentSession.tenant,
      expect.objectContaining({ publicationId }),
      "provider_down",
    );
  });
});
