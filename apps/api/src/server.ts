import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import { assertCan, AuthorizationError } from "@profit-pilot/authz";
import { identifierSchema } from "@profit-pilot/contracts";
import { checkDatabaseReady, closeDatabase } from "@profit-pilot/db";
import { developmentContentReview, developmentOverview } from "@profit-pilot/fixtures";

import type { ApiConfig } from "./config.js";
import { AuthenticationError, createIdentityProvider, type IdentityProvider } from "./identity.js";

export interface ServerDependencies {
  config: ApiConfig;
  identityProvider?: IdentityProvider;
  readinessProbe?: () => Promise<void>;
}

export async function buildServer({
  config,
  identityProvider = createIdentityProvider(config),
  readinessProbe = config.DATABASE_URL ? checkDatabaseReady : async () => undefined,
}: ServerDependencies): Promise<FastifyInstance> {
  const server = Fastify({
    bodyLimit: 1_048_576,
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "*.password",
          "*.secret",
          "*.token",
        ],
        censor: "[REDACTED]",
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: (request) => String(request.headers["x-request-id"] ?? crypto.randomUUID()),
    trustProxy: true,
  });

  await server.register(sensible);
  await server.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await server.register(cors, {
    credentials: true,
    origin: config.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
  });
  await server.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthenticationError) {
      request.log.warn({ err: error }, "authentication failed");
      return reply.status(401).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/unauthenticated",
        title: "Authentication required",
        status: 401,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AuthorizationError) {
      request.log.warn({ err: error }, "authorization failed");
      return reply.status(403).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/forbidden",
        title: "Insufficient permission",
        status: 403,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof Error && "validation" in error && error.validation) {
      request.log.warn({ err: error }, "request validation failed");
      return reply.status(400).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/invalid-request",
        title: "Invalid request",
        status: 400,
        detail: error.message,
        requestId: request.id,
      });
    }

    request.log.error({ err: error }, "request failed");
    return reply.status(500).type("application/problem+json").send({
      type: "https://profitpilot.app/problems/internal",
      title: "Internal server error",
      status: 500,
      requestId: request.id,
    });
  });

  server.setNotFoundHandler((request, reply) =>
    reply.status(404).type("application/problem+json").send({
      type: "https://profitpilot.app/problems/not-found",
      title: "Resource not found",
      status: 404,
      requestId: request.id,
    }),
  );

  server.addHook("onClose", async () => {
    await closeDatabase();
  });

  server.get("/health/live", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));

  server.get("/health/ready", { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await readinessProbe();
      return {
        status: "ready",
        dependencies: {
          database: config.DATABASE_URL ? "available" : "development-seed",
        },
      };
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      return reply.status(503).send({
        status: "not_ready",
        dependencies: {
          database: "unavailable",
        },
      });
    }
  });

  server.get("/v1/session", async (request) => {
    const context = await identityProvider.authenticate(request);
    return context;
  });

  server.get<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/overview",
    async (request, reply) => {
      const context = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      if (context.workspaceId !== workspaceId) {
        throw new AuthorizationError(
          context.role,
          "opportunities:read",
          "The requested workspace is outside the authenticated tenant context",
        );
      }
      assertCan(context.role, "opportunities:read");

      if (config.NODE_ENV === "production") {
        return reply.status(501).type("application/problem+json").send({
          type: "https://profitpilot.app/problems/repository-unavailable",
          title: "Overview repository is not configured",
          status: 501,
          requestId: request.id,
        });
      }

      return developmentOverview;
    },
  );

  server.get<{ Params: { contentId: string } }>(
    "/v1/content/:contentId",
    async (request, reply) => {
      const context = await identityProvider.authenticate(request);
      identifierSchema.parse(request.params.contentId);
      assertCan(context.role, "content:edit");

      if (config.NODE_ENV === "production") {
        return reply.status(501).type("application/problem+json").send({
          type: "https://profitpilot.app/problems/repository-unavailable",
          title: "Content repository is not configured",
          status: 501,
          requestId: request.id,
        });
      }

      return developmentContentReview;
    },
  );

  return server;
}
