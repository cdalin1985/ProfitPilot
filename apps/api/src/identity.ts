import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { authenticatedActorSchema, type AuthenticatedActor } from "@profit-pilot/contracts";

import type { ApiConfig } from "./config.js";

export const developmentActor: AuthenticatedActor = {
  externalIdentityId: "user_development_owner",
  identityProviderOrganizationId: "org_development_profit_pilot",
  sessionId: "session_development",
};

export interface IdentityProvider {
  authenticate(request: FastifyRequest): Promise<AuthenticatedActor>;
}

export function createIdentityProvider(config: ApiConfig): IdentityProvider {
  if (config.AUTH_MODE === "development") {
    return {
      async authenticate(): Promise<AuthenticatedActor> {
        return developmentActor;
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
    async authenticate(request): Promise<AuthenticatedActor> {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new AuthenticationError("A bearer token is required");
      }

      try {
        const token = authorization.slice("Bearer ".length);
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"],
        });
        return authenticatedActorSchema.parse({
          externalIdentityId: payload.sub,
          identityProviderOrganizationId: payload["org_id"],
          sessionId: payload.sid,
        });
      } catch (error) {
        throw new AuthenticationError("The bearer token is invalid or expired", {
          cause: error,
        });
      }
    },
  };
}

export class AuthenticationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthenticationError";
  }
}
