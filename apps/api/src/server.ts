import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { assertCan, AuthorizationError } from "@profit-pilot/authz";
import {
  awinConnectionTestResponseSchema,
  awinFeedImportResponseSchema,
  approveContentRevisionSchema,
  contentReviewActionResponseSchema,
  contentReviewSchema,
  contentDraftResponseSchema,
  configureWordPressDestinationSchema,
  createContentDraftSchema,
  createWordPressDraftSchema,
  createAffiliateLinkSchema,
  affiliateLinkSchema,
  createOrganizationWorkspaceSchema,
  identifierSchema,
  importAwinFeedSchema,
  requestContentChangesSchema,
  testAwinConnectionSchema,
  testWordPressConnectionSchema,
  wordpressConnectionTestResponseSchema,
  wordpressDestinationSchema,
  wordpressDraftPublicationSchema,
} from "@profit-pilot/contracts";
import {
  AffiliateConnectionUnavailableError,
  checkDatabaseReady,
  closeDatabase,
  FeedSyncFreshnessError,
  FeedSyncInProgressError,
  FeedSyncQuotaError,
  ContentGenerationIdempotencyConflictError,
  ContentGenerationInProgressError,
  OpportunityUnavailableError,
  ContentApprovalBlockedError,
  ContentReviewIdempotencyConflictError,
  ContentReviewNotFoundError,
  ContentReviewStateError,
  StaleContentRevisionError,
  PublicationContentStateError,
  PublicationIdempotencyConflictError,
  PublicationInProgressError,
  PublicationLeaseLostError,
  PublishingDestinationNotFoundError,
  AffiliateLinkNotFoundError,
  AffiliateLinkStateError,
  AffiliateLinkIdempotencyConflictError,
} from "@profit-pilot/db";
import { developmentOverview } from "@profit-pilot/fixtures";

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
  ContentGenerationConfigurationError,
  ContentGenerationUnavailableError,
  createConfiguredContentGenerationService,
  type ContentGenerationService,
} from "./content-generation.js";
import { createContentReviewService, type ContentReviewService } from "./content-review.js";
import {
  createConfiguredPublicationService,
  type PublicationService,
  WordPressPublicationConfigurationError,
} from "./publication.js";
import {
  AwinAuthenticationError,
  AwinFeedNotFoundError,
  AwinFeedValidationError,
  AwinUnavailableError,
  createAwinClient,
  type AwinClient,
} from "./awin.js";
import { IdentityProvisioningError } from "./identity-admin.js";
import { AuthenticationError, createIdentityProvider, type IdentityProvider } from "./identity.js";
import {
  createProductIngestionService,
  type ProductIngestionService,
} from "./product-ingestion.js";
import {
  createAwinCredentialResolver,
  createOpenAICredentialResolver,
  createWordPressCredentialResolver,
  SecretResolutionError,
} from "./secrets.js";
import {
  createWordPressClient,
  UnsafeWordPressTargetError,
  WordPressAuthenticationError,
  WordPressDraftConflictError,
  WordPressUnavailableError,
} from "./wordpress.js";
import {
  createClickAttributionService,
  type ClickAttributionService,
} from "./click-attribution.js";

export interface ServerDependencies {
  config: ApiConfig;
  identityProvider?: IdentityProvider;
  services?: ApplicationServices;
  readinessProbe?: () => Promise<void>;
  awinClient?: AwinClient;
  productIngestionService?: ProductIngestionService;
  contentGenerationService?: ContentGenerationService;
  contentReviewService?: ContentReviewService;
  publicationService?: PublicationService;
  clickAttributionService?: ClickAttributionService;
}

export async function buildServer({
  config,
  identityProvider = createIdentityProvider(config),
  services = createApplicationServices(config),
  readinessProbe = config.DATABASE_URL ? checkDatabaseReady : async () => undefined,
  awinClient = createAwinClient(),
  productIngestionService = createProductIngestionService({
    awinClient,
    credentialResolver: createAwinCredentialResolver(config),
  }),
  contentGenerationService = createConfiguredContentGenerationService(
    config,
    createOpenAICredentialResolver(config),
  ),
  contentReviewService = createContentReviewService(config),
  publicationService = createConfiguredPublicationService(
    config,
    createWordPressClient(),
    createWordPressCredentialResolver(config),
  ),
  clickAttributionService = createClickAttributionService(config),
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
          "*.applicationPassword",
          "*.secret",
          "*.token",
          "*.accessToken",
          "*.apiKey",
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

    if (error instanceof AwinFeedNotFoundError) {
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/awin-feed-not-found",
        title: "Awin feed could not be found",
        status: 422,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AwinFeedValidationError) {
      request.log.warn({ err: error }, "Awin feed validation failed");
      return reply.status(502).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/awin-feed-invalid",
        title: "Awin returned an invalid product feed",
        status: 502,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AffiliateConnectionUnavailableError) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/affiliate-connection-unavailable",
        title: "Awin connection is unavailable",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof SecretResolutionError) {
      request.log.error({ err: error }, "credential resolution failed");
      return reply.status(503).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/secret-resolution-failed",
        title: "The stored credential is unavailable",
        status: 503,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof ContentGenerationIdempotencyConflictError) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/content-idempotency-conflict",
        title: "Content generation idempotency conflict",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof ContentReviewNotFoundError) {
      return reply.status(404).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/content-review-not-found",
        title: "Content review not found",
        status: 404,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (
      error instanceof ContentReviewIdempotencyConflictError ||
      error instanceof StaleContentRevisionError ||
      error instanceof ContentReviewStateError
    ) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/content-review-conflict",
        title: "Content review conflict",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof ContentApprovalBlockedError) {
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/content-approval-blocked",
        title: "Content approval blocked",
        status: 422,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof UnsafeWordPressTargetError) {
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/unsafe-wordpress-target",
        title: "WordPress destination is not allowed",
        status: 422,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof WordPressAuthenticationError) {
      return reply.status(422).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/wordpress-authentication-failed",
        title: "WordPress connection could not be verified",
        status: 422,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof PublishingDestinationNotFoundError) {
      return reply.status(404).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/publishing-destination-not-found",
        title: "Publishing destination not found",
        status: 404,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof PublicationInProgressError) {
      const retryAfter = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1_000));
      return reply
        .header("retry-after", String(retryAfter))
        .status(409)
        .type("application/problem+json")
        .send({
          type: "https://profitpilot.app/problems/publication-in-progress",
          title: "WordPress publication is in progress",
          status: 409,
          detail: error.message,
          requestId: request.id,
        });
    }

    if (
      error instanceof PublicationContentStateError ||
      error instanceof PublicationIdempotencyConflictError ||
      error instanceof PublicationLeaseLostError ||
      error instanceof WordPressDraftConflictError
    ) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/wordpress-publication-conflict",
        title: "WordPress publication conflict",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof AffiliateLinkNotFoundError) {
      return reply.status(404).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/affiliate-link-not-found",
        title: "Affiliate link not found",
        status: 404,
        requestId: request.id,
      });
    }
    if (
      error instanceof AffiliateLinkStateError ||
      error instanceof AffiliateLinkIdempotencyConflictError
    ) {
      return reply.status(409).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/affiliate-link-conflict",
        title: "Affiliate link conflict",
        status: 409,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (
      error instanceof WordPressUnavailableError ||
      error instanceof WordPressPublicationConfigurationError
    ) {
      request.log.error({ err: error }, "WordPress publication unavailable");
      return reply.status(503).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/wordpress-unavailable",
        title: "WordPress publication is unavailable",
        status: 503,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof ContentGenerationInProgressError) {
      const retryAfter = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1_000));
      return reply
        .header("retry-after", String(retryAfter))
        .status(409)
        .type("application/problem+json")
        .send({
          type: "https://profitpilot.app/problems/content-generation-in-progress",
          title: "Content generation is in progress",
          status: 409,
          detail: error.message,
          requestId: request.id,
        });
    }

    if (error instanceof OpportunityUnavailableError) {
      return reply.status(404).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/opportunity-unavailable",
        title: "Opportunity unavailable",
        status: 404,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (
      error instanceof ContentGenerationConfigurationError ||
      error instanceof ContentGenerationUnavailableError
    ) {
      request.log.error({ err: error }, "grounded content generation unavailable");
      return reply.status(503).type("application/problem+json").send({
        type: "https://profitpilot.app/problems/content-generation-unavailable",
        title: "Grounded content generation is unavailable",
        status: 503,
        detail: error.message,
        requestId: request.id,
      });
    }

    if (
      error instanceof FeedSyncFreshnessError ||
      error instanceof FeedSyncInProgressError ||
      error instanceof FeedSyncQuotaError
    ) {
      const retryAfter = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1_000));
      return reply
        .header("retry-after", String(retryAfter))
        .status(429)
        .type("application/problem+json")
        .send({
          type: "https://profitpilot.app/problems/awin-feed-rate-limited",
          title: "Awin feed import is not eligible yet",
          status: 429,
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

  server.post<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/connections/awin/imports",
    {
      config: {
        rateLimit: {
          max: 4,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "connections:manage");
      const input = importAwinFeedSchema.parse(request.body);
      return awinFeedImportResponseSchema.parse(
        await productIngestionService.importAwinFeed(context, input),
      );
    },
  );

  server.post<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/connections/wordpress/test",
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
      const connection = testWordPressConnectionSchema.parse(request.body);
      return wordpressConnectionTestResponseSchema.parse(
        await publicationService.testConnection(connection),
      );
    },
  );

  server.put<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/destinations/wordpress",
    async (request) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "connections:manage");
      const destination = configureWordPressDestinationSchema.parse(request.body);
      return wordpressDestinationSchema.parse(
        await publicationService.configureDestination(context, destination),
      );
    },
  );

  server.post<{ Params: { workspaceId: string } }>(
    "/v1/workspaces/:workspaceId/content/drafts",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:edit");
      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
      );
      const input = createContentDraftSchema.parse(request.body);
      const result = contentDraftResponseSchema.parse(
        await contentGenerationService.createDraft(context, input, idempotencyKey),
      );
      return reply
        .status(result.replayed ? 200 : 201)
        .header("location", `/v1/content/${result.contentId}`)
        .send(result);
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
      assertCan(context, "content:read");
      const content = await contentReviewService.get(context, request.params.contentId);
      return content
        ? contentReviewSchema.parse(content)
        : reply.status(404).type("application/problem+json").send({
            type: "https://profitpilot.app/problems/content-review-not-found",
            title: "Content review not found",
            status: 404,
            requestId: request.id,
          });
    },
  );

  server.post<{ Params: { workspaceId: string; contentId: string } }>(
    "/v1/workspaces/:workspaceId/content/:contentId/review/request-changes",
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const contentId = identifierSchema.parse(request.params.contentId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:approve");
      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
      );
      const input = requestContentChangesSchema.parse(request.body);
      const result = contentReviewActionResponseSchema.parse(
        await contentReviewService.requestChanges(context, contentId, input, idempotencyKey),
      );
      return reply.status(result.replayed ? 200 : 201).send(result);
    },
  );

  server.post<{ Params: { workspaceId: string; contentId: string } }>(
    "/v1/workspaces/:workspaceId/content/:contentId/affiliate-links",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const contentId = identifierSchema.parse(request.params.contentId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:publish");
      const header = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof header === "string" ? header : undefined,
      );
      const result = affiliateLinkSchema.parse(
        await clickAttributionService.createLink(
          context,
          contentId,
          createAffiliateLinkSchema.parse(request.body),
          idempotencyKey,
        ),
      );
      return reply
        .status(result.replayed ? 200 : 201)
        .header("location", `/v1/affiliate-links/${result.linkId}`)
        .send(result);
    },
  );

  server.post<{ Params: { workspaceId: string; linkId: string } }>(
    "/v1/workspaces/:workspaceId/affiliate-links/:linkId/revoke",
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const linkId = identifierSchema.parse(request.params.linkId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:publish");
      await clickAttributionService.revokeLink(context, linkId);
      return reply.status(204).send();
    },
  );

  server.post<{ Params: { workspaceId: string; contentId: string } }>(
    "/v1/workspaces/:workspaceId/content/:contentId/review/approve",
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const contentId = identifierSchema.parse(request.params.contentId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:approve");
      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
      );
      const input = approveContentRevisionSchema.parse(request.body);
      const result = contentReviewActionResponseSchema.parse(
        await contentReviewService.approve(context, contentId, input, idempotencyKey),
      );
      return reply.status(result.replayed ? 200 : 201).send(result);
    },
  );

  server.post<{ Params: { workspaceId: string; contentId: string } }>(
    "/v1/workspaces/:workspaceId/content/:contentId/publications/wordpress-draft",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const actor = await identityProvider.authenticate(request);
      const workspaceId = identifierSchema.parse(request.params.workspaceId);
      const contentId = identifierSchema.parse(request.params.contentId);
      const context = await services.resolveTenant(actor, workspaceId);
      assertCan(context, "content:publish");
      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = identifierSchema.parse(
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
      );
      const input = createWordPressDraftSchema.parse(request.body);
      const result = wordpressDraftPublicationSchema.parse(
        await publicationService.createDraft(context, contentId, input, idempotencyKey),
      );
      return reply
        .status(result.replayed ? 200 : 201)
        .header("location", `/v1/publications/${result.publicationId}`)
        .send(result);
    },
  );

  return server;
}
