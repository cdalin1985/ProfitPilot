import { createHmac, timingSafeEqual } from "node:crypto";

import { identifierSchema } from "@profit-pilot/contracts";

const TOKEN_VERSION = "v1";
const TOKEN_LIMIT = 768;

export interface ClickTokenPayload {
  version: typeof TOKEN_VERSION;
  keyId: string;
  linkId: string;
  organizationId: string;
  workspaceId: string;
  expiresAt: number;
}

export class InvalidClickTokenError extends Error {
  readonly code = "invalid_click_token";
  constructor() {
    super("The click token is invalid or expired");
    this.name = "InvalidClickTokenError";
  }
}

function key(input: string): Buffer {
  const decoded = Buffer.from(input, "base64url");
  if (decoded.length < 32) throw new Error("Click signing keys must contain at least 32 bytes");
  return decoded;
}

function canonical(payload: ClickTokenPayload): string {
  return [
    payload.version,
    payload.keyId,
    payload.linkId,
    payload.organizationId,
    payload.workspaceId,
    String(payload.expiresAt),
  ].join(".");
}

export function signClickToken(
  input: Omit<ClickTokenPayload, "version">,
  signingKey: string,
): string {
  const payload: ClickTokenPayload = { version: TOKEN_VERSION, ...input };
  const encoded = Buffer.from(canonical(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", key(signingKey)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyClickToken(
  token: string,
  keys: Readonly<Record<string, string>>,
  now = new Date(),
): ClickTokenPayload {
  if (!token || token.length > TOKEN_LIMIT) throw new InvalidClickTokenError();
  const segments = token.split(".");
  if (segments.length !== 2) throw new InvalidClickTokenError();
  const [encoded, supplied] = segments as [string, string];
  let fields: string[];
  try {
    fields = Buffer.from(encoded, "base64url").toString("utf8").split(".");
  } catch {
    throw new InvalidClickTokenError();
  }
  if (fields.length !== 6) throw new InvalidClickTokenError();
  const [version, keyId, linkId, organizationId, workspaceId, expiry] = fields;
  if (
    version !== TOKEN_VERSION ||
    !keyId ||
    !linkId ||
    !organizationId ||
    !workspaceId ||
    !expiry ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)
  ) {
    throw new InvalidClickTokenError();
  }
  const signingKey = keys[keyId];
  const expiresAt = Number(expiry);
  if (
    !signingKey ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now.getTime() / 1000) ||
    expiresAt > Math.floor(now.getTime() / 1000) + 400 * 86_400
  ) {
    throw new InvalidClickTokenError();
  }
  try {
    identifierSchema.parse(linkId);
    identifierSchema.parse(organizationId);
    identifierSchema.parse(workspaceId);
  } catch {
    throw new InvalidClickTokenError();
  }
  const expected = createHmac("sha256", key(signingKey)).update(encoded).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(supplied, "base64url");
  } catch {
    throw new InvalidClickTokenError();
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InvalidClickTokenError();
  }
  return { version, keyId, linkId, organizationId, workspaceId, expiresAt };
}

export function classifyUserAgent(input: {
  method: "GET" | "HEAD";
  userAgent?: string;
  purpose?: string;
  secPurpose?: string;
}): { userAgentClass: string; botReason: string | null } {
  if (input.method === "HEAD") return { userAgentClass: "head", botReason: "head_request" };
  if (/prefetch|preview/i.test(`${input.purpose ?? ""} ${input.secPurpose ?? ""}`)) {
    return { userAgentClass: "prefetch", botReason: "prefetch" };
  }
  const ua = (input.userAgent ?? "").slice(0, 512);
  if (!ua) return { userAgentClass: "missing", botReason: "missing_user_agent" };
  if (/bot|crawler|spider|slurp|headless|facebookexternalhit|curl|wget/i.test(ua)) {
    return { userAgentClass: "automated", botReason: "known_automation" };
  }
  const userAgentClass = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
  return { userAgentClass, botReason: null };
}
