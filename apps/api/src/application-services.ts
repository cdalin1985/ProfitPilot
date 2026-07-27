import { createHash, createHmac } from "node:crypto";

import {
  createOrganizationWorkspaceResponseSchema,
  sessionStateSchema,
  type AuthenticatedActor,
  type CreateOrganizationWorkspace,
  type CreateOrganizationWorkspaceResponse,
  type SessionState,
  type TenantContext,
} from "@profit-pilot/contracts";
import { developmentSession, developmentTenantContext } from "@profit-pilot/fixtures";
import {
  completeOnboarding,
  getOrganizationWorkspace,
  IdempotencyConflictError,
  listActorOrganizations,
  listActorWorkspaces,
  listAvailableWorkspaces,
  OnboardingStateError,
  recordOnboardingFailure,
  recordOnboardingIdentity,
  replayCompletedOnboarding,
  reserveOnboarding,
  resolveTenant,
  TenantResolutionError,
} from "@profit-pilot/db";

import type { ApiConfig } from "./config.js";
import { createIdentityAdmin, type IdentityAdmin } from "./identity-admin.js";

export interface OnboardingRequestContext {
  idempotencyKey: string;
  requestId: string;
  sourceIp: string;
}

export interface ApplicationServices {
  getSession(actor: AuthenticatedActor, requestedWorkspaceId?: string): Promise<SessionState>;
  resolveTenant(actor: AuthenticatedActor, workspaceId: string): Promise<TenantContext>;
  createOrganizationWorkspace(
    actor: AuthenticatedActor,
    input: CreateOrganizationWorkspace,
    requestContext: OnboardingRequestContext,
  ): Promise<CreateOrganizationWorkspaceResponse>;
}

export class ApplicationDependencyError extends Error {
  readonly code = "application_dependency_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "ApplicationDependencyError";
  }
}

function fingerprint(input: CreateOrganizationWorkspace): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function sourceIpHash(config: ApiConfig, sourceIp: string): string | undefined {
  if (!config.AUDIT_IP_HASH_KEY) {
    return undefined;
  }
  return createHmac("sha256", config.AUDIT_IP_HASH_KEY).update(sourceIp).digest("hex");
}

export function createApplicationServices(
  config: ApiConfig,
  identityAdmin: IdentityAdmin = createIdentityAdmin(config),
): ApplicationServices {
  if (!config.DATABASE_URL) {
    return {
      async getSession(_actor, requestedWorkspaceId) {
        if (requestedWorkspaceId && requestedWorkspaceId !== developmentTenantContext.workspaceId) {
          throw new TenantResolutionError();
        }
        return sessionStateSchema.parse(developmentSession);
      },
      async resolveTenant(_actor, workspaceId) {
        if (workspaceId !== developmentTenantContext.workspaceId) {
          throw new TenantResolutionError();
        }
        return developmentTenantContext;
      },
      async createOrganizationWorkspace() {
        throw new ApplicationDependencyError(
          "Organization onboarding requires a configured PostgreSQL database",
        );
      },
    };
  }

  return {
    async getSession(actor, requestedWorkspaceId) {
      if (!actor.identityProviderOrganizationId) {
        const organizations = await listActorOrganizations(actor.externalIdentityId);
        if (organizations.length === 0) {
          return { status: "onboarding_required" };
        }
        return sessionStateSchema.parse({
          status: "organization_selection_required",
          organizations,
        });
      }

      const selection = await listActorWorkspaces(actor);
      const usableWorkspaces = selection.workspaces.filter(
        (workspace) => workspace.status !== "suspended",
      );
      const selectedWorkspaceId =
        requestedWorkspaceId ??
        (usableWorkspaces.length === 1 ? usableWorkspaces[0]?.id : undefined);
      if (!selectedWorkspaceId) {
        return sessionStateSchema.parse(selection);
      }

      const tenant = await resolveTenant(actor, selectedWorkspaceId);
      const [active, availableWorkspaces] = await Promise.all([
        getOrganizationWorkspace(tenant, actor.externalIdentityId),
        listAvailableWorkspaces(tenant, actor.externalIdentityId),
      ]);
      return sessionStateSchema.parse({
        status: "active",
        tenant,
        active,
        availableWorkspaces,
      });
    },

    resolveTenant,

    async createOrganizationWorkspace(actor, input, requestContext) {
      const reservation = await reserveOnboarding(
        actor,
        requestContext.idempotencyKey,
        fingerprint(input),
      );

      try {
        if (reservation.status === "completed") {
          return createOrganizationWorkspaceResponseSchema.parse(
            await replayCompletedOnboarding(actor, reservation),
          );
        }

        if (
          actor.identityProviderOrganizationId &&
          actor.identityProviderOrganizationId !== reservation.identityProviderOrganizationId
        ) {
          throw new OnboardingStateError(
            "Organization onboarding must start outside an active organization session",
          );
        }

        const identityProfile = await identityAdmin.getUser(actor.externalIdentityId);
        if (!identityProfile.emailVerified) {
          throw new OnboardingStateError(
            "Verify the WorkOS account email before creating an organization",
          );
        }

        const identityProviderOrganizationId = await identityAdmin.ensureOrganization({
          localOrganizationId: reservation.organizationId,
          name: input.organizationName,
        });
        const identityProviderMembershipId = await identityAdmin.ensureOrganizationMembership({
          identityProviderOrganizationId,
          externalIdentityId: actor.externalIdentityId,
        });

        await recordOnboardingIdentity(actor, requestContext.idempotencyKey, {
          identityProviderOrganizationId,
          identityProviderMembershipId,
        });

        const auditSourceIpHash = sourceIpHash(config, requestContext.sourceIp);
        const result = await completeOnboarding({
          actor,
          reservation: {
            ...reservation,
            identityProviderOrganizationId,
            identityProviderMembershipId,
          },
          request: input,
          identityProfile,
          identityProviderOrganizationId,
          identityProviderMembershipId,
          requestId: requestContext.requestId,
          ...(auditSourceIpHash ? { sourceIpHash: auditSourceIpHash } : {}),
        });
        return createOrganizationWorkspaceResponseSchema.parse(result);
      } catch (error) {
        try {
          await recordOnboardingFailure(
            actor,
            requestContext.idempotencyKey,
            error instanceof Error && "code" in error
              ? String(error.code)
              : "unclassified_onboarding_failure",
          );
        } catch (recordingError) {
          throw new AggregateError(
            [error, recordingError],
            "Onboarding failed and its failure state could not be recorded",
          );
        }
        throw error;
      }
    },
  };
}

export { IdempotencyConflictError, OnboardingStateError, TenantResolutionError };
