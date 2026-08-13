import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InvalidClickTokenError,
  classifyUserAgent,
  signClickToken,
  verifyClickToken,
} from "./index.js";

const signingKey = randomBytes(32).toString("base64url");
const input = {
  keyId: "primary",
  linkId: randomUUID(),
  organizationId: randomUUID(),
  workspaceId: randomUUID(),
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe("signed click tokens", () => {
  it("round trips a canonical token", () => {
    expect(
      verifyClickToken(signClickToken(input, signingKey), { primary: signingKey }),
    ).toMatchObject(input);
  });
  it("rejects tampering, expiry, and unknown keys", () => {
    const token = signClickToken(input, signingKey);
    expect(() => verifyClickToken(`${token.slice(0, -1)}x`, { primary: signingKey })).toThrow(
      InvalidClickTokenError,
    );
    expect(() => verifyClickToken(token, {})).toThrow(InvalidClickTokenError);
    expect(() =>
      verifyClickToken(token, { primary: signingKey }, new Date((input.expiresAt + 1) * 1000)),
    ).toThrow(InvalidClickTokenError);
  });
});

describe("traffic classification", () => {
  it("rejects prefetch and bots but accepts normal GETs", () => {
    expect(
      classifyUserAgent({ method: "GET", purpose: "prefetch", userAgent: "Browser" }).botReason,
    ).toBe("prefetch");
    expect(classifyUserAgent({ method: "GET", userAgent: "Googlebot" }).botReason).toBe(
      "known_automation",
    );
    expect(classifyUserAgent({ method: "GET", userAgent: "Mozilla/5.0" })).toEqual({
      userAgentClass: "desktop",
      botReason: null,
    });
  });
});
