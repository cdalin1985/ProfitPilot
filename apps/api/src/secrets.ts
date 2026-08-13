import {
  GetSecretValueCommand,
  SecretsManagerClient,
  type SecretsManagerClientConfig,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

import type { ApiConfig } from "./config.js";

const accessTokenSchema = z.string().trim().min(20).max(4096);
const structuredSecretSchema = z.object({ accessToken: accessTokenSchema });
const apiKeySchema = z.string().trim().min(20).max(4096);
const structuredApiKeySchema = z.object({ apiKey: apiKeySchema });
const wordpressUsernameSchema = z.string().trim().min(1).max(255);
const wordpressApplicationPasswordSchema = z.string().trim().min(20).max(512);
const wordpressCredentialSchema = z.object({
  username: wordpressUsernameSchema,
  applicationPassword: wordpressApplicationPasswordSchema,
});
const stripeCredentialsSchema = z.object({
  secretKey: z
    .string()
    .trim()
    .regex(/^sk_(?:test|live)_[A-Za-z0-9_]+$/)
    .max(512),
  webhookSecret: z
    .string()
    .trim()
    .regex(/^whsec_[A-Za-z0-9]+$/)
    .max(512),
});

export interface AwinCredentialResolver {
  resolveAccessToken(secretReference: string): Promise<string>;
}

export interface OpenAICredentialResolver {
  resolveApiKey(secretReference: string): Promise<string>;
}

export interface WordPressCredentials {
  username: string;
  applicationPassword: string;
}

export interface WordPressCredentialResolver {
  resolveCredentials(secretReference: string): Promise<WordPressCredentials>;
}

export interface StripeCredentials {
  secretKey: string;
  webhookSecret: string;
}

export interface StripeCredentialResolver {
  resolveCredentials(secretReference: string): Promise<StripeCredentials>;
}

export class SecretResolutionError extends Error {
  readonly code = "secret_resolution_failed";

  constructor() {
    super("The credential could not be loaded from the configured secret store");
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

function parseApiKey(value: string): string {
  const direct = apiKeySchema.safeParse(value);
  if (direct.success && !value.trim().startsWith("{")) return direct.data;

  try {
    return structuredApiKeySchema.parse(JSON.parse(value)).apiKey;
  } catch {
    throw new SecretResolutionError();
  }
}

function parseWordPressCredentials(value: string): WordPressCredentials {
  try {
    return wordpressCredentialSchema.parse(JSON.parse(value));
  } catch {
    throw new SecretResolutionError();
  }
}

function parseStripeCredentials(value: string): StripeCredentials {
  try {
    return stripeCredentialsSchema.parse(JSON.parse(value));
  } catch {
    throw new SecretResolutionError();
  }
}

function createSecretReader(
  config: Pick<ApiConfig, "AWS_REGION">,
  client: SecretsManagerReader = new SecretsManagerClient({
    region: config.AWS_REGION,
  } satisfies SecretsManagerClientConfig),
): (secretReference: string) => Promise<string> {
  return async (secretReference) => {
    if (!secretReference || secretReference.length > 2048 || /[\r\n\0]/.test(secretReference)) {
      throw new SecretResolutionError();
    }

    try {
      const result = await client.send(new GetSecretValueCommand({ SecretId: secretReference }));
      const secret =
        result.SecretString ??
        (result.SecretBinary ? Buffer.from(result.SecretBinary).toString("utf8") : undefined);
      if (!secret) throw new SecretResolutionError();
      return secret;
    } catch (error) {
      if (error instanceof SecretResolutionError) throw error;
      throw new SecretResolutionError();
    }
  };
}

export function createAwinCredentialResolver(
  config: Pick<ApiConfig, "AWS_REGION">,
  client?: SecretsManagerReader,
): AwinCredentialResolver {
  const readSecret = createSecretReader(config, client);
  return {
    async resolveAccessToken(secretReference) {
      return parseSecret(await readSecret(secretReference));
    },
  };
}

export function createOpenAICredentialResolver(
  config: Pick<ApiConfig, "AWS_REGION">,
  client?: SecretsManagerReader,
): OpenAICredentialResolver {
  const readSecret = createSecretReader(config, client);
  return {
    async resolveApiKey(secretReference) {
      return parseApiKey(await readSecret(secretReference));
    },
  };
}

export function createWordPressCredentialResolver(
  config: Pick<ApiConfig, "AWS_REGION">,
  client?: SecretsManagerReader,
): WordPressCredentialResolver {
  const readSecret = createSecretReader(config, client);
  return {
    async resolveCredentials(secretReference) {
      return parseWordPressCredentials(await readSecret(secretReference));
    },
  };
}

export function createStripeCredentialResolver(
  config: Pick<ApiConfig, "AWS_REGION">,
  client?: SecretsManagerReader,
): StripeCredentialResolver {
  const readSecret = createSecretReader(config, client);
  return {
    async resolveCredentials(secretReference) {
      return parseStripeCredentials(await readSecret(secretReference));
    },
  };
}
