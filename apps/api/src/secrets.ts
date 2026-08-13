import {
  GetSecretValueCommand,
  SecretsManagerClient,
  type SecretsManagerClientConfig,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

import type { ApiConfig } from "./config.js";

const accessTokenSchema = z.string().trim().min(20).max(4096);
const structuredSecretSchema = z.object({ accessToken: accessTokenSchema });

export interface AwinCredentialResolver {
  resolveAccessToken(secretReference: string): Promise<string>;
}

export class SecretResolutionError extends Error {
  readonly code = "secret_resolution_failed";

  constructor() {
    super("The Awin credential could not be loaded from the configured secret store");
    this.name = "SecretResolutionError";
  }
}

interface SecretsManagerReader {
  send(command: GetSecretValueCommand): Promise<{
    SecretString?: string;
    SecretBinary?: Uint8Array;
  }>;
}

function parseSecret(value: string): string {
  const direct = accessTokenSchema.safeParse(value);
  if (direct.success && !value.trim().startsWith("{")) return direct.data;

  try {
    return structuredSecretSchema.parse(JSON.parse(value)).accessToken;
  } catch {
    throw new SecretResolutionError();
  }
}

export function createAwinCredentialResolver(
  config: Pick<ApiConfig, "AWS_REGION">,
  client: SecretsManagerReader = new SecretsManagerClient({
    region: config.AWS_REGION,
  } satisfies SecretsManagerClientConfig),
): AwinCredentialResolver {
  return {
    async resolveAccessToken(secretReference) {
      if (!secretReference || secretReference.length > 2048 || /[\r\n\0]/.test(secretReference)) {
        throw new SecretResolutionError();
      }

      try {
        const result = await client.send(new GetSecretValueCommand({ SecretId: secretReference }));
        const secret =
          result.SecretString ??
          (result.SecretBinary ? Buffer.from(result.SecretBinary).toString("utf8") : undefined);
        if (!secret) throw new SecretResolutionError();
        return parseSecret(secret);
      } catch (error) {
        if (error instanceof SecretResolutionError) throw error;
        throw new SecretResolutionError();
      }
    },
  };
}
