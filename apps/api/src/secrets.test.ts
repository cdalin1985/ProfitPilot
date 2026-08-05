import { describe, expect, it, vi } from "vitest";

import { createAwinCredentialResolver, SecretResolutionError } from "./secrets.js";

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
});
