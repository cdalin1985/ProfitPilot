import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { tenantContextSchema, type TenantContext } from "@profit-pilot/contracts";

import type { ApiConfig } from "./config.js";

const developmentContext: TenantContext = {
  organizationId: "018f6d4d-74d4-7c18-a1d4-bb620a63b001",
  workspaceId: "018f6d4d-74d4-7c18-a1d4-bb620a63b002",
  userId: "018f6d4d-74d4-7c18-a1d4-bb620a63b003",
  role: "owner",
};

export interface IdentityProvider {
  authenticate(request: FastifyRequest): Promise<TenantContext>;
}

export function createIdentityProvider(config: ApiConfig): IdentityProvider {
  if (config.AUTH_MODE === "development") {
    return {
      async authenticate(): Promise<TenantContext> {
        return developmentContext;
      },
    };
  }

  const jwksUrl = config.AUTH_JWKS_URL;
  const issuer = config.AUTH_ISSUER;
  const audience = config.AUTH_AUDIENCE;
  if (!jwksUrl || !issuer || !audience) {
    throw new Error("OIDC configuration is incomplete");
  }

  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  return {
    async authenticate(request): Promise<TenantContext> {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new AuthenticationError("A bearer token is required");
      }

      const token = authorization.slice("Bearer ".length);
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      return tenantContextSchema.parse({
        organizationId: payload["org_id"],
        workspaceId: payload["workspace_id"],
        userId: payload.sub,
        role: payload["role"],
      });
    },
  };
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
