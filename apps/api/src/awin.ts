import { z } from "zod";

const publisherSchema = z.object({
  publisherId: z.number().int().positive(),
  name: z.string().min(1),
});

const publishersSchema = z.array(publisherSchema).min(1);

export type AwinPublisher = z.infer<typeof publisherSchema>;

export class AwinAuthenticationError extends Error {
  readonly code = "awin_authentication_failed";

  constructor() {
    super("Awin rejected the access token");
    this.name = "AwinAuthenticationError";
  }
}

export class AwinUnavailableError extends Error {
  readonly code = "awin_unavailable";

  constructor(message = "Awin is temporarily unavailable") {
    super(message);
    this.name = "AwinUnavailableError";
  }
}

export class AwinFeedNotFoundError extends Error {
  readonly code = "awin_feed_not_found";

  constructor() {
    super("Awin could not find that advertiser feed and locale");
    this.name = "AwinFeedNotFoundError";
  }
}

export class AwinFeedValidationError extends Error {
  readonly code = "awin_feed_invalid";

  constructor(message = "Awin returned an invalid or incomplete product feed") {
    super(message);
    this.name = "AwinFeedValidationError";
  }
}

export interface AwinFeedRequest {
  accessToken: string;
  publisherId: number;
  advertiserId: number;
  locale: string;
  ifNoneMatch?: string;
  ifModifiedSince?: Date;
}

export type AwinFeedDownload =
  | { status: "not_modified" }
  | {
      status: "downloaded";
      products: Record<string, unknown>[];
      etag?: string;
      lastModifiedAt?: Date;
    };

export interface AwinClient {
  listPublishers(accessToken: string): Promise<AwinPublisher[]>;
  downloadEnhancedFeed(input: AwinFeedRequest): Promise<AwinFeedDownload>;
}

const MAX_FEED_BYTES = 64 * 1_024 * 1_024;
const MAX_PRODUCT_BYTES = 1 * 1_024 * 1_024;
const MAX_PRODUCTS = 50_000;

function parseFeedLine(line: string, products: Record<string, unknown>[]): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (Buffer.byteLength(trimmed, "utf8") > MAX_PRODUCT_BYTES) {
    throw new AwinFeedValidationError("An Awin product exceeded the supported size limit");
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new AwinFeedValidationError("Awin returned malformed JSONL");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AwinFeedValidationError("An Awin feed line was not a product object");
  }
  if ("error" in value) {
    throw new AwinFeedValidationError("Awin reported an incomplete feed download");
  }
  products.push(value as Record<string, unknown>);
  if (products.length > MAX_PRODUCTS) {
    throw new AwinFeedValidationError("The Awin feed exceeded the atomic import quota");
  }
}

async function readJsonLines(response: Response): Promise<Record<string, unknown>[]> {
  if (!response.body) {
    throw new AwinFeedValidationError("Awin returned an empty feed response");
  }

  const products: Record<string, unknown>[] = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffered = "";
  let bytesRead = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new AwinFeedValidationError("The Awin feed exceeded the atomic import size quota");
    }
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) parseFeedLine(line, products);
  }

  buffered += decoder.decode();
  parseFeedLine(buffered, products);
  return products;
}

function parseLastModified(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function createAwinClient(
  fetchImplementation: typeof fetch = fetch,
  baseUrl = "https://api.awin.com",
): AwinClient {
  return {
    async listPublishers(accessToken) {
      let response: Response;
      try {
        response = await fetchImplementation(`${baseUrl}/publishers`, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new AwinUnavailableError();
      }

      if (response.status === 401 || response.status === 403) {
        throw new AwinAuthenticationError();
      }
      if (!response.ok) {
        throw new AwinUnavailableError(`Awin returned HTTP ${response.status}`);
      }

      const parsed = publishersSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new AwinUnavailableError("Awin returned an unexpected publisher response");
      }
      return parsed.data;
    },

    async downloadEnhancedFeed(input) {
      const headers: Record<string, string> = {
        accept: "application/jsonlines, application/x-ndjson, application/jsonl",
        authorization: `Bearer ${input.accessToken}`,
      };
      if (input.ifNoneMatch) headers["if-none-match"] = input.ifNoneMatch;
      if (input.ifModifiedSince) {
        headers["if-modified-since"] = input.ifModifiedSince.toUTCString();
      }

      let response: Response;
      try {
        const feedName = `${input.advertiserId}-retail-${input.locale}.jsonl`;
        response = await fetchImplementation(
          `${baseUrl}/publishers/${input.publisherId}/awinfeeds/download/${feedName}`,
          {
            headers,
            signal: AbortSignal.timeout(120_000),
          },
        );
      } catch {
        throw new AwinUnavailableError();
      }

      if (response.status === 304) return { status: "not_modified" };
      if (response.status === 401 || response.status === 403) {
        throw new AwinAuthenticationError();
      }
      if (response.status === 404) throw new AwinFeedNotFoundError();
      if (!response.ok) {
        throw new AwinUnavailableError(`Awin returned HTTP ${response.status}`);
      }

      const products = await readJsonLines(response);
      const etag = response.headers.get("etag") ?? undefined;
      const lastModifiedAt = parseLastModified(response.headers.get("last-modified"));
      return {
        status: "downloaded",
        products,
        ...(etag ? { etag } : {}),
        ...(lastModifiedAt ? { lastModifiedAt } : {}),
      };
    },
  };
}
