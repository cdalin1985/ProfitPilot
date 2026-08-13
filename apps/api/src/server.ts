import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { assertCan, AuthorizationError } from "@profit-pilot/authz";
import {
  awinConnectionTestResponseSchema,
  createOrganizationWorkspaceSchema,
  identifierSchema,
  testAwinConnectionSchema,
} from "@profit-pilot/contracts";
import { checkDatabaseReady, closeDatabase } from "@profit-pilot/db";
import { developmentContentReview, developmentOverview } from "@profit-pilot/fixtures";

import {
  ApplicationDependencyError,
  createApplicationServices,
  IdempotencyConflictError,
  OnboardingStateError,
  TenantResolutionError,
  type ApplicationServices,
} from "./application-services.js";
import type { ApiConfig } from "./config.js";
import {
  AwinAuthenticationError,
  AwinUnavailableError,
  createAwinClient,
  type AwinClient,
} from "./awin.js";
import { IdentityProvisioningError } from "./identity-admin.js";
import { AuthenticationError, createIdentityProvider, type IdentityProvider } from "./identity.js";

export interface ServerDependencies {
  config: ApiConfig;
  identityProvider?: IdentityProvider;
  services?: ApplicationServices;
  readinessProbe?: () => Promise<void>;
  awinClient?: AwinClient;
}

export async function buildServer({
  config,
  identityProvider = createIdentityProvider(config),
  services = createApplicationServices(config),
  readinessProbe = config.DATABASE_URL ? checkDatabaseReady : async () => undefined,
  awinClient = createAwinClient(),
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

    if (error instanceof TenantResolutionError) {
      request.log.warn({ err: error }, "tenant resolution failed");
      return reply.status(403).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/tenant-access-denied",
        title: "Tenant access denied",
        status: 403,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof IdempotencyConflictError) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/idempotency-conflict",
        title: "Idempotency conflict",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof OnboardingStateError) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/onboarding-state-conflict",
        title: "Onboarding cannot continue",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof IdentityProvisioningError || error instanceof ApplicationDependencyError) {
      request.log.error({ err: error }, "onboarding dependency unavailable");
      return reply.status(503).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/dependency-unavailable",
        title: "A required service is unavailable",
        status: 503,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AwinAuthenticationError) {
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/awin-authentication-failed",
        title: "Awin connection could not be verified",
        status: 422,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AwinUnavailableError) {
      request.log.warn({ err: error }, "Awin connection test unavailable");
      return reply.status(503).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/awin-unavailable",
        title: "Awin is temporarily unavailable",
        status: 503,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const field = issue.path.join(".") || "request";
        errors[field] = [...(errors[field] ?? []), issue.message];
      }
      request.log.warn({ validationIssues: error.issues }, "request validation failed");
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/invalid-request",
        title: "Invalid request",
        status: 422,
        detail: "Correct the highlighted fields and try again.",
        errors,
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
    const actor = await identityProvider.authenticate(request);
    const requestedWorkspaceHeader = request.headers["x-workspace-id"];
    const requestedWorkspaceId =
      typeof requestedWorkspaceHeader === "string"
        ? identifierSchema.parse(requestedWorkspaceHeader)
        : undefined;
    return services.getSession(actor, requestedWorkspaceId);
  });

  server.post(
    "/v1/onboarding/organization-workspace",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
      );
      const input = createOrganizationWorkspaceSchema.parse(request.body);
      const result = await services.createOrganizationWorkspace(actor, input, {
        idempotencyKey,
        requestId: request.id,
        sourceIp: request.ip,
      });

      return reply
        .status(result.replayed ? 200 : 201)
        .header("location", `/v1/workspaces/${result.workspace.id}`)
        .send(result);
    },
  );

  server.get<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/overview",
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "opportunities:read");

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

  server.post<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/connections/awin/test",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "connections:manage");
      const input = testAwinConnectionSchema.parse(request.body);
      const publishers = await awinClient.listPublishers(input.accessToken);

      return awinConnectionTestResponseSchema.parse({
        provider: "awin",
        status: "verified",
        publishers,
        verifiedAt: new Date().toISOString(),
      });
    },
  );

  server.get<{ Params: { contentId: string } }>(
    "/v1/content/:contentId",
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      identifierSchema.parse(request.params.contentId);
      const workspaceHeader = request.headers["x-workspace-id"];
      const workspaceId = identifierSchema.parse(
        typeof workspaceHeader === "string" ? workspaceHeader : undefined,
      );
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:edit");

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
