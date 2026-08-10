import {
  awinConnectionTestResponseSchema,
  awinFeedImportResponseSchema,
} from "@profit-pilot/contracts";

import { createAwinClient } from "../src/awin.js";
import {
  AWIN_MAX_REJECTION_RATE,
  normalizeAwinProduct,
  OPPORTUNITY_SCORE_VERSION,
} from "../src/product-ingestion.js";
import { createAwinCredentialResolver } from "../src/secrets.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) {
    throw new Error(`${name} is required and must be a single non-empty value`);
  }
  return value;
}

function positiveInteger(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalCommissionRate(): number | undefined {
  const raw = process.env.AWIN_COMMISSION_RATE?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("AWIN_COMMISSION_RATE must be between 0 and 100");
  }
  return value;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The staging API returned non-JSON HTTP ${response.status}`);
  }
}

async function verifyDeployedApi(input: {
  accessToken: string;
  publisherId: number;
  advertiserId: number;
  locale: string;
  commissionRate?: number;
}): Promise<{ connection: "not_requested" | "verified"; import: string }> {
  const baseUrl = process.env.AWIN_STAGING_API_BASE_URL?.trim();
  const authToken = process.env.AWIN_STAGING_AUTH_TOKEN?.trim();
  if (!baseUrl && !authToken) return { connection: "not_requested", import: "not_requested" };
  if (!baseUrl || !authToken) {
    throw new Error("AWIN_STAGING_API_BASE_URL and AWIN_STAGING_AUTH_TOKEN must be set together");
  }

  const workspaceId = requiredEnvironment("AWIN_WORKSPACE_ID");
  const headers = {
    authorization: `Bearer ${authToken}`,
    "content-type": "application/json",
  };
  const connectionResponse = await fetch(
    new URL(`/v1/workspaces/${workspaceId}/connections/awin/test`, baseUrl),
    {
      method: "POST",
      headers,
      body: JSON.stringify({ accessToken: input.accessToken }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const connectionBody = await parseResponse(connectionResponse);
  if (!connectionResponse.ok) {
    throw new Error(`The staging Awin connection route returned HTTP ${connectionResponse.status}`);
  }
  const connection = awinConnectionTestResponseSchema.parse(connectionBody);
  if (!connection.publishers.some((publisher) => publisher.publisherId === input.publisherId)) {
    throw new Error("The staging Awin connection route did not return AWIN_PUBLISHER_ID");
  }

  if (process.env.AWIN_RUN_STAGING_IMPORT !== "true") {
    return { connection: "verified", import: "not_requested" };
  }

  const connectionId = requiredEnvironment("AWIN_CONNECTION_ID");
  const importResponse = await fetch(
    new URL(`/v1/workspaces/${workspaceId}/connections/awin/imports`, baseUrl),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        connectionId,
        publisherId: input.publisherId,
        advertiserId: input.advertiserId,
        locale: input.locale,
        ...(input.commissionRate === undefined ? {} : { commissionRate: input.commissionRate }),
      }),
      signal: AbortSignal.timeout(180_000),
    },
  );
  const importBody = await parseResponse(importResponse);
  if (!importResponse.ok) {
    throw new Error(`The staging Awin import route returned HTTP ${importResponse.status}`);
  }
  const imported = awinFeedImportResponseSchema.parse(importBody);
  return { connection: "verified", import: imported.status };
}

async function main(): Promise<void> {
  const awsRegion = requiredEnvironment("AWS_REGION");
  const secretReference = requiredEnvironment("AWIN_SECRET_REFERENCE");
  const publisherId = positiveInteger("AWIN_PUBLISHER_ID");
  const advertiserId = positiveInteger("AWIN_ADVERTISER_ID");
  const locale = requiredEnvironment("AWIN_FEED_LOCALE");
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(locale)) {
    throw new Error("AWIN_FEED_LOCALE must use the Awin format, such as en_US");
  }
  const commissionRate = optionalCommissionRate();

  const credentialResolver = createAwinCredentialResolver({ AWS_REGION: awsRegion });
  const accessToken = await credentialResolver.resolveAccessToken(secretReference);
  const awinClient = createAwinClient();
  const publishers = await awinClient.listPublishers(accessToken);
  if (!publishers.some((publisher) => publisher.publisherId === publisherId)) {
    throw new Error("The resolved Awin token does not grant access to AWIN_PUBLISHER_ID");
  }

  const download = await awinClient.downloadEnhancedFeed({
    accessToken,
    publisherId,
    advertiserId,
    locale,
  });
  if (download.status !== "downloaded" || download.products.length === 0) {
    throw new Error("The selected Awin enhanced feed must return at least one product");
  }

  const downloadedAt = new Date();
  let accepted = 0;
  let rejected = 0;
  for (const rawProduct of download.products) {
    try {
      const product = normalizeAwinProduct(
        rawProduct,
        {
          advertiserId,
          ...(commissionRate === undefined ? {} : { commissionRate }),
        },
        downloadedAt,
      );
      if (product.opportunity.scoreVersion !== OPPORTUNITY_SCORE_VERSION) {
        throw new Error("Unexpected opportunity score version");
      }
      accepted += 1;
    } catch {
      rejected += 1;
    }
  }

  const rejectionRate = rejected / download.products.length;
  if (accepted === 0 || rejectionRate > AWIN_MAX_REJECTION_RATE) {
    throw new Error(
      `The real feed rejected ${(rejectionRate * 100).toFixed(2)}% of products; the maximum is ${(AWIN_MAX_REJECTION_RATE * 100).toFixed(2)}%`,
    );
  }

  const api = await verifyDeployedApi({
    accessToken,
    publisherId,
    advertiserId,
    locale,
    ...(commissionRate === undefined ? {} : { commissionRate }),
  });

  console.log(
    JSON.stringify(
      {
        status: "passed",
        secretReference,
        publisherAccounts: publishers.length,
        feed: { publisherId, advertiserId, locale },
        products: {
          received: download.products.length,
          accepted,
          rejected,
          rejectionRate: Number(rejectionRate.toFixed(6)),
        },
        scoreVersion: OPPORTUNITY_SCORE_VERSION,
        stagingApi: api,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Awin staging verification failed");
  process.exitCode = 1;
});
