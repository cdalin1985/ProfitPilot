import { describe, expect, it, vi } from "vitest";

import type { ImportAwinFeed, TenantContext } from "@profit-pilot/contracts";
import type { FeedSyncReservation } from "@profit-pilot/db";

import type { AwinClient } from "./awin.js";
import {
  createProductIngestionService,
  normalizeAwinProduct,
  OPPORTUNITY_SCORE_VERSION,
  scoreOpportunity,
} from "./product-ingestion.js";

const downloadedAt = new Date("2026-08-05T12:00:00.000Z");

const context: TenantContext = {
  organizationId: "018f6d4d-74d4-7c18-a1d4-bb620a63b001",
  workspaceId: "018f6d4d-74d4-7c18-a1d4-bb620a63b002",
  userId: "018f6d4d-74d4-7c18-a1d4-bb620a63b003",
  organizationRole: "owner",
  workspaceRole: "workspace_admin",
};

const input: ImportAwinFeed = {
  connectionId: "018f6d4d-74d4-7c18-a1d4-bb620a63b101",
  publisherId: 1234,
  advertiserId: 5678,
  locale: "en_US",
  commissionRate: 10,
};

const reservation: FeedSyncReservation = {
  id: "018f6d4d-74d4-7c18-a1d4-bb620a63b201",
  connectionId: input.connectionId,
  publisherId: input.publisherId,
  advertiserId: input.advertiserId,
  locale: input.locale,
  secretReference: "profit-pilot/test/awin",
  sourceEtag: '"feed-v1"',
};

describe("Awin product ingestion", () => {
  it("normalizes the enhanced Google-format product and preserves source evidence", () => {
    const raw = {
      id: "sku-100",
      title: "Nomad 65W Travel Charger",
      description: "Compact charger with two documented USB-C outputs.",
      link: "https://merchant.example/products/sku-100",
      image_link: "https://merchant.example/images/sku-100.png",
      google_product_category: "Electronics > Power",
      brand: "Nomad",
      mpn: "N65",
      availability: "in_stock",
      price: "79.00 USD",
      sale_price: "59.00 USD",
      last_updated: "2026-08-05T10:00:00.000Z",
      meta: { advertiser_name: "Northstar Supply" },
    };

    const product = normalizeAwinProduct(raw, input, downloadedAt);

    expect(product).toMatchObject({
      sourceProductId: "awin:5678:sku-100",
      canonicalKey: "brand-mpn:nomad:n65",
      merchantName: "Northstar Supply",
      currency: "USD",
      price: "59.0000",
      commissionRate: "10.0000",
      available: true,
    });
    expect(product.opportunity).toMatchObject({ scoreVersion: OPPORTUNITY_SCORE_VERSION });
    expect(product.opportunity.score).toBeGreaterThan(60);
    expect(product.sourcePayload).toEqual(raw);
  });

  it("supports Awin's sectioned product representation", () => {
    const product = normalizeAwinProduct(
      {
        meta: { advertiser_name: "Northstar Supply" },
        product_basic: { id: "sku-200", title: "Thermal mug" },
        price_and_availability: { price: "32.00 USD", availability: "in_stock" },
        product_description: { description: "Double-wall insulated mug" },
      },
      input,
      downloadedAt,
    );

    expect(product).toMatchObject({
      sourceProductId: "awin:5678:sku-200",
      merchantName: "Northstar Supply",
      currency: "USD",
    });
  });

  it("scores unavailable products at zero and explains missing commission data", () => {
    const result = scoreOpportunity({
      available: false,
      observedAt: downloadedAt,
      listPrice: 100,
      currentPrice: 50,
      commissionRate: null,
      evidenceFields: 6,
      scoredAt: downloadedAt,
    });

    expect(result.score).toBe(0);
    expect(result.explanation.notes).toEqual(
      expect.arrayContaining([
        "Commission rate is unknown, so no commission component was awarded.",
        "Unavailable products are not eligible opportunities.",
      ]),
    );
  });

  it("uses persisted validators and completes one atomic import", async () => {
    const downloadEnhancedFeed = vi.fn(async () => ({
      status: "downloaded" as const,
      etag: '"feed-v2"',
      products: [
        {
          id: "sku-100",
          title: "Travel charger",
          price: "49.00 USD",
          availability: "in_stock",
        },
      ],
    }));
    const awinClient: AwinClient = {
      async listPublishers() {
        return [];
      },
      downloadEnhancedFeed,
    };
    const reserve = vi.fn(async () => reservation);
    const complete = vi.fn(async () => new Date("2026-08-05T12:15:00.000Z"));
    const fail = vi.fn(async () => undefined);
    const service = createProductIngestionService({
      awinClient,
      credentialResolver: {
        async resolveAccessToken() {
          return "a-secure-connection-token";
        },
      },
      now: () => downloadedAt,
      reserve,
      complete,
      fail,
    });

    const result = await service.importAwinFeed(context, input);

    expect(result).toMatchObject({
      status: "ingested",
      products: { received: 1, accepted: 1, rejected: 0 },
    });
    expect(downloadEnhancedFeed).toHaveBeenCalledWith(
      expect.objectContaining({ ifNoneMatch: '"feed-v1"' }),
    );
    expect(complete).toHaveBeenCalledWith(
      context,
      reservation,
      expect.arrayContaining([expect.objectContaining({ sourceProductId: "awin:5678:sku-100" })]),
      expect.objectContaining({ sourceEtag: '"feed-v2"' }),
    );
    expect(fail).not.toHaveBeenCalled();
  });

  it("preserves the existing catalog when provider normalization drifts", async () => {
    const awinClient: AwinClient = {
      async listPublishers() {
        return [];
      },
      async downloadEnhancedFeed() {
        return {
          status: "downloaded",
          products: [{ unexpected: true }],
        };
      },
    };
    const complete = vi.fn(async () => new Date());
    const fail = vi.fn(async () => undefined);
    const service = createProductIngestionService({
      awinClient,
      credentialResolver: {
        async resolveAccessToken() {
          return "a-secure-connection-token";
        },
      },
      now: () => downloadedAt,
      reserve: async () => reservation,
      complete,
      fail,
    });

    await expect(service.importAwinFeed(context, input)).rejects.toMatchObject({
      code: "awin_feed_invalid",
    });
    expect(complete).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalled();
  });
});
