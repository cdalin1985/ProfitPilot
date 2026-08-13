import { describe, expect, it, vi } from "vitest";

import {
  createAwinCredentialResolver,
  createOpenAICredentialResolver,
  createWordPressCredentialResolver,
  SecretResolutionError,
} from "./secrets.js";

describe("Awin credential resolver", () => {
  it("loads a structured access token without exposing it in errors", async () => {
    const send = vi.fn(async () => ({
      SecretString: JSON.stringify({ accessToken: "a-secure-connection-token" }),
    }));
    const resolver = createAwinCredentialResolver({ AWS_REGION: "us-east-1" }, { send });

    await expect(resolver.resolveAccessToken("profit-pilot/test/awin")).resolves.toBe(
      "a-secure-connection-token",
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("fails closed on missing or malformed secrets", async () => {
    const resolver = createAwinCredentialResolver(
      { AWS_REGION: "us-east-1" },
      {
        async send() {
          return { SecretString: "too-short" };
        },
      },
    );

    const error = await resolver
      .resolveAccessToken("profit-pilot/test/awin")
      .catch((value) => value);
    expect(error).toBeInstanceOf(SecretResolutionError);
    expect(String(error)).not.toContain("too-short");
  });

  it("loads a structured OpenAI API key from the same server-side boundary", async () => {
    const resolver = createOpenAICredentialResolver(
      { AWS_REGION: "us-east-1" },
      {
        async send() {
          return { SecretString: JSON.stringify({ apiKey: "sk-test-0123456789abcdefghij" }) };
        },
      },
    );

    await expect(resolver.resolveApiKey("profit-pilot/test/openai")).resolves.toBe(
      "sk-test-0123456789abcdefghij",
    );
  });

  it("loads structured WordPress credentials without returning the secret payload", async () => {
    const resolver = createWordPressCredentialResolver(
      { AWS_REGION: "us-east-1" },
      {
        async send() {
          return {
            SecretString: JSON.stringify({
              username: "publisher",
              applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
            }),
          };
        },
      },
    );

    await expect(resolver.resolveCredentials("profit-pilot/test/wordpress")).resolves.toEqual({
      username: "publisher",
      applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    });
  });
});
