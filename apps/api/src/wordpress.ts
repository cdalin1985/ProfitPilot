import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { z } from "zod";

import type { WordPressCredentials } from "./secrets.js";

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 15_000;

export class UnsafeWordPressTargetError extends Error {
  readonly code = "unsafe_wordpress_target";

  constructor() {
    super("The WordPress site must be a public HTTPS destination");
    this.name = "UnsafeWordPressTargetError";
  }
}

export class WordPressAuthenticationError extends Error {
  readonly code = "wordpress_authentication_failed";

  constructor() {
    super("The WordPress Application Password could not be verified");
    this.name = "WordPressAuthenticationError";
  }
}

export class WordPressUnavailableError extends Error {
  readonly code = "wordpress_unavailable";

  constructor() {
    super("The WordPress destination is temporarily unavailable");
    this.name = "WordPressUnavailableError";
  }
}

export class WordPressDraftConflictError extends Error {
  readonly code = "wordpress_draft_conflict";

  constructor() {
    super("The deterministic WordPress post already exists in a non-draft state");
    this.name = "WordPressDraftConflictError";
  }
}

export interface WordPressUser {
  id: number;
  name: string;
}

export interface WordPressDraft {
  id: string;
  slug: string;
  status: "draft";
  url: string;
  reused: boolean;
}

interface TransportResponse {
  status: number;
  body: unknown;
}

export interface WordPressTransport {
  request(
    url: URL,
    options: { method: "GET" | "POST"; headers: Record<string, string>; body?: string },
  ): Promise<TransportResponse>;
}

export interface WordPressClient {
  verify(siteUrl: string, credentials: WordPressCredentials): Promise<WordPressUser>;
  ensureDraft(input: {
    siteUrl: string;
    credentials: WordPressCredentials;
    title: string;
    content: string;
    slug: string;
  }): Promise<WordPressDraft>;
}

type AddressResolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isUnsafeIp(address: string): boolean {
  if (address.toLowerCase().startsWith("::ffff:")) {
    return isUnsafeIpv4(address.slice("::ffff:".length));
  }
  const family = isIP(address);
  if (family === 4) return isUnsafeIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:")
  );
}

const defaultResolver: AddressResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function resolveSafeWordPressUrl(
  input: string | URL,
  resolver: AddressResolver = defaultResolver,
): Promise<{ url: URL; address: string; family: number }> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new UnsafeWordPressTargetError();
  }
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new UnsafeWordPressTargetError();
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new UnsafeWordPressTargetError();
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await resolver(hostname);
  } catch {
    throw new UnsafeWordPressTargetError();
  }
  if (addresses.length === 0 || addresses.some((item) => isUnsafeIp(item.address))) {
    throw new UnsafeWordPressTargetError();
  }
  return { url, ...addresses[0]! };
}

function parseBody(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new WordPressUnavailableError();
  }
}

export function createSecureWordPressTransport(
  resolver: AddressResolver = defaultResolver,
): WordPressTransport {
  return {
    async request(url, options) {
      const safe = await resolveSafeWordPressUrl(url, resolver);
      return new Promise<TransportResponse>((resolve, reject) => {
        const request = httpsRequest(
          {
            protocol: "https:",
            hostname: safe.url.hostname,
            port: 443,
            path: `${safe.url.pathname}${safe.url.search}`,
            method: options.method,
            headers: options.headers,
            servername: safe.url.hostname,
            lookup: (_hostname, _options, callback) =>
              callback(null, safe.address, safe.family as 4 | 6),
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > MAX_RESPONSE_BYTES) request.destroy(new WordPressUnavailableError());
              else chunks.push(chunk);
            });
            response.on("end", () => {
              const status = response.statusCode ?? 502;
              if (status >= 300 && status < 400) {
                reject(new WordPressUnavailableError());
                return;
              }
              try {
                resolve({ status, body: parseBody(Buffer.concat(chunks).toString("utf8")) });
              } catch (error) {
                reject(error);
              }
            });
          },
        );
        request.setTimeout(REQUEST_TIMEOUT_MS, () =>
          request.destroy(new WordPressUnavailableError()),
        );
        request.on("error", (error) =>
          reject(
            error instanceof UnsafeWordPressTargetError ? error : new WordPressUnavailableError(),
          ),
        );
        if (options.body) request.write(options.body);
        request.end();
      });
    },
  };
}

const userSchema = z.object({ id: z.number().int().positive(), name: z.string().min(1).max(255) });
const postSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]).transform(String),
  slug: z.string().min(1).max(200),
  status: z.string().min(1),
  link: z.string().url(),
});

function endpoint(siteUrl: string, path: string): URL {
  const base = new URL(siteUrl);
  const prefix = base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}${path}`;
  base.search = "";
  return base;
}

function authHeaders(credentials: WordPressCredentials): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(
      `${credentials.username}:${credentials.applicationPassword}`,
    ).toString("base64")}`,
  };
}

function assertSuccess(response: TransportResponse): void {
  if (response.status === 401 || response.status === 403) throw new WordPressAuthenticationError();
  if (response.status < 200 || response.status >= 300) throw new WordPressUnavailableError();
}

export function canonicalWordPressSiteUrl(input: string): string {
  const url = new URL(input);
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function createWordPressClient(
  transport: WordPressTransport = createSecureWordPressTransport(),
): WordPressClient {
  return {
    async verify(siteUrl, credentials) {
      const url = endpoint(siteUrl, "/wp-json/wp/v2/users/me");
      url.searchParams.set("context", "edit");
      url.searchParams.set("_fields", "id,name");
      const response = await transport.request(url, {
        method: "GET",
        headers: authHeaders(credentials),
      });
      assertSuccess(response);
      return userSchema.parse(response.body);
    },

    async ensureDraft({ siteUrl, credentials, title, content, slug }) {
      const query = endpoint(siteUrl, "/wp-json/wp/v2/posts");
      query.searchParams.set("slug", slug);
      query.searchParams.set("status", "any");
      query.searchParams.set("context", "edit");
      query.searchParams.set("per_page", "1");
      query.searchParams.set("_fields", "id,slug,status,link");
      const existingResponse = await transport.request(query, {
        method: "GET",
        headers: authHeaders(credentials),
      });
      assertSuccess(existingResponse);
      const existing = z.array(postSchema).parse(existingResponse.body)[0];
      if (existing) {
        if (existing.status !== "draft") throw new WordPressDraftConflictError();
        return { ...existing, status: "draft", url: existing.link, reused: true };
      }

      const response = await transport.request(endpoint(siteUrl, "/wp-json/wp/v2/posts"), {
        method: "POST",
        headers: { ...authHeaders(credentials), "content-type": "application/json" },
        body: JSON.stringify({ title, content, slug, status: "draft" }),
      });
      assertSuccess(response);
      const created = postSchema.parse(response.body);
      if (created.status !== "draft") throw new WordPressDraftConflictError();
      return { ...created, status: "draft", url: created.link, reused: false };
    },
  };
}
