import { and, eq, ne, sql } from "drizzle-orm";

import type {
  AuthenticatedActor,
  CreateOrganizationWorkspace,
  CreateOrganizationWorkspaceResponse,
  OnboardingStep,
} from "@profit-pilot/contracts";

import { withActor, withTenant } from "./database.js";
import {
  auditEvents,
  memberships,
  onboardingRequests,
  organizations,
  users,
  workspaceMemberships,
  workspaceOnboardingSteps,
  workspaces,
} from "./schema.js";
import { getOrganizationWorkspace, resolveTenant } from "./tenancy.js";

const onboardingSteps: readonly OnboardingStep[] = [
  "workspace_profile",
  "publishing_destination",
  "affiliate_connection",
  "brand_policy",
  "sample_import",
  "evidence_backed_draft",
  "destination_draft",
  "destination_verification",
  "workspace_activation",
];

export interface IdentityProfile {
  email: string;
  displayName: string;
  emailVerified: boolean;
  profilePictureUrl?: string;
}

export interface OnboardingReservation {
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  status: "pending" | "completed" | "failed";
  identityProviderOrganizationId?: string;
  identityProviderMembershipId?: string;
  replayed: boolean;
}

export interface CompleteOnboardingInput {
  actor: AuthenticatedActor;
  reservation: OnboardingReservation;
  request: CreateOrganizationWorkspace;
  identityProfile: IdentityProfile;
  identityProviderOrganizationId: string;
  identityProviderMembershipId: string;
  requestId?: string;
  sourceIpHash?: string;
}

export interface OnboardingIdentityLink {
  identityProviderOrganizationId: string;
  identityProviderMembershipId: string;
}

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict";

  constructor() {
    super("The idempotency key has already been used with a different request");
    this.name = "IdempotencyConflictError";
  }
}

export class OnboardingStateError extends Error {
  readonly code = "onboarding_state_conflict";

  constructor(message: string) {
    super(message);
    this.name = "OnboardingStateError";
  }
}

function slugify(name: string, identifier: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "workspace"}-${identifier.slice(0, 8)}`;
}

export async function reserveOnboarding(
  actor: AuthenticatedActor,
  idempotencyKey: string,
  requestFingerprint: string,
): Promise<OnboardingReservation> {
  return withActor(actor.externalIdentityId, async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(onboardingRequests)
      .where(eq(onboardingRequests.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError();
      }

      await transaction
        .update(onboardingRequests)
        .set({
          attemptCount: sql`${onboardingRequests.attemptCount} + 1`,
          lastAttemptAt: new Date(),
          lastErrorCode: null,
          status: existing.status === "completed" ? "completed" : "pending",
          updatedAt: new Date(),
        })
        .where(eq(onboardingRequests.idempotencyKey, idempotencyKey));

      return {
        idempotencyKey,
        organizationId: existing.organizationId,
        workspaceId: existing.workspaceId,
        status: existing.status,
        ...(existing.identityProviderOrganizationId
          ? {
              identityProviderOrganizationId: existing.identityProviderOrganizationId,
            }
          : {}),
        ...(existing.identityProviderMembershipId
          ? {
              identityProviderMembershipId: existing.identityProviderMembershipId,
            }
          : {}),
        replayed: true,
      };
    }

    const organizationId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const [inserted] = await transaction
      .insert(onboardingRequests)
      .values({
        idempotencyKey,
        externalIdentityId: actor.externalIdentityId,
        requestFingerprint,
        organizationId,
        workspaceId,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ idempotencyKey: onboardingRequests.idempotencyKey });

    if (inserted) {
      return {
        idempotencyKey,
        organizationId,
        workspaceId,
        status: "pending",
        replayed: false,
      };
    }

    const [concurrent] = await transaction
      .select()
      .from(onboardingRequests)
      .where(eq(onboardingRequests.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!concurrent || concurrent.requestFingerprint !== requestFingerprint) {
      throw new IdempotencyConflictError();
    }

    return {
      idempotencyKey,
      organizationId: concurrent.organizationId,
      workspaceId: concurrent.workspaceId,
      status: concurrent.status,
      ...(concurrent.identityProviderOrganizationId
        ? {
            identityProviderOrganizationId: concurrent.identityProviderOrganizationId,
          }
        : {}),
      ...(concurrent.identityProviderMembershipId
        ? {
            identityProviderMembershipId: concurrent.identityProviderMembershipId,
          }
        : {}),
      replayed: true,
    };
  });
}

export async function recordOnboardingIdentity(
  actor: AuthenticatedActor,
  idempotencyKey: string,
  link: OnboardingIdentityLink,
): Promise<void> {
  await withActor(actor.externalIdentityId, async (transaction) => {
    const [request] = await transaction
      .select({
        status: onboardingRequests.status,
        identityProviderOrganizationId: onboardingRequests.identityProviderOrganizationId,
        identityProviderMembershipId: onboardingRequests.identityProviderMembershipId,
      })
      .from(onboardingRequests)
      .where(
        and(
          eq(onboardingRequests.idempotencyKey, idempotencyKey),
          eq(onboardingRequests.externalIdentityId, actor.externalIdentityId),
        ),
      )
      .limit(1);

    if (!request) {
      throw new OnboardingStateError("The onboarding reservation no longer exists");
    }
    if (
      (request.identityProviderOrganizationId &&
        request.identityProviderOrganizationId !== link.identityProviderOrganizationId) ||
      (request.identityProviderMembershipId &&
        request.identityProviderMembershipId !== link.identityProviderMembershipId)
    ) {
      throw new OnboardingStateError(
        "The onboarding reservation is linked to different identity-provider resources",
      );
    }
    if (request.status === "completed") {
      return;
    }

    await transaction
      .update(onboardingRequests)
      .set({
        identityProviderOrganizationId: link.identityProviderOrganizationId,
        identityProviderMembershipId: link.identityProviderMembershipId,
        updatedAt: new Date(),
      })
      .where(eq(onboardingRequests.idempotencyKey, idempotencyKey));
  });
}

export async function recordOnboardingFailure(
  actor: AuthenticatedActor,
  idempotencyKey: string,
  errorCode: string,
): Promise<void> {
  await withActor(actor.externalIdentityId, async (transaction) => {
    await transaction
      .update(onboardingRequests)
      .set({
        status: "failed",
        lastErrorCode: errorCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(onboardingRequests.idempotencyKey, idempotencyKey),
          eq(onboardingRequests.externalIdentityId, actor.externalIdentityId),
          ne(onboardingRequests.status, "completed"),
        ),
      );
  });
}

export async function replayCompletedOnboarding(
  actor: AuthenticatedActor,
  reservation: OnboardingReservation,
): Promise<CreateOrganizationWorkspaceResponse> {
  if (reservation.status !== "completed" || !reservation.identityProviderOrganizationId) {
    throw new OnboardingStateError("The onboarding reservation is not complete");
  }

  const tenant = await resolveTenant(
    {
      ...actor,
      identityProviderOrganizationId: reservation.identityProviderOrganizationId,
    },
    reservation.workspaceId,
  );
  const result = await getOrganizationWorkspace(tenant, actor.externalIdentityId);
  return {
    ...result,
    replayed: true,
  };
}

export async function completeOnboarding({
  actor,
  reservation,
  request,
  identityProfile,
  identityProviderOrganizationId,
  identityProviderMembershipId,
  requestId,
  sourceIpHash,
}: CompleteOnboardingInput): Promise<CreateOrganizationWorkspaceResponse> {
  if (!identityProfile.emailVerified) {
    throw new OnboardingStateError("A verified email is required before onboarding");
  }

  let replayed = reservation.replayed;
  if (reservation.status !== "completed") {
    const completedByAnotherRequest = await withTenant(
      reservation.organizationId,
      reservation.workspaceId,
      async (transaction) => {
        const [storedRequest] = await transaction
          .select()
          .from(onboardingRequests)
          .where(
            and(
              eq(onboardingRequests.idempotencyKey, reservation.idempotencyKey),
              eq(onboardingRequests.externalIdentityId, actor.externalIdentityId),
            ),
          )
          .limit(1)
          .for("update");

        if (!storedRequest) {
          throw new OnboardingStateError("The onboarding reservation no longer exists");
        }
        if (
          (storedRequest.identityProviderOrganizationId &&
            storedRequest.identityProviderOrganizationId !== identityProviderOrganizationId) ||
          (storedRequest.identityProviderMembershipId &&
            storedRequest.identityProviderMembershipId !== identityProviderMembershipId)
        ) {
          throw new OnboardingStateError(
            "The onboarding reservation is linked to different identity-provider resources",
          );
        }
        if (storedRequest.status === "completed") {
          return true;
        }

        const now = new Date();
        const [user] = await transaction
          .insert(users)
          .values({
            externalIdentityId: actor.externalIdentityId,
            email: identityProfile.email.toLowerCase(),
            displayName: identityProfile.displayName,
            emailVerified: identityProfile.emailVerified,
            profilePictureUrl: identityProfile.profilePictureUrl,
            lastAuthenticatedAt: now,
          })
          .onConflictDoUpdate({
            target: users.externalIdentityId,
            set: {
              email: identityProfile.email.toLowerCase(),
              displayName: identityProfile.displayName,
              emailVerified: identityProfile.emailVerified,
              profilePictureUrl: identityProfile.profilePictureUrl,
              lastAuthenticatedAt: now,
              updatedAt: now,
            },
          })
          .returning({ id: users.id });

        if (!user) {
          throw new OnboardingStateError("The authenticated user could not be persisted");
        }

        const organizationSlug = slugify(request.organizationName, reservation.organizationId);
        const workspaceSlug = slugify(request.workspace.name, reservation.workspaceId);

        await transaction.insert(organizations).values({
          id: reservation.organizationId,
          identityProviderOrganizationId,
          name: request.organizationName,
          slug: organizationSlug,
          createdByUserId: user.id,
        });
        await transaction.insert(workspaces).values({
          id: reservation.workspaceId,
          organizationId: reservation.organizationId,
          name: request.workspace.name,
          slug: workspaceSlug,
          targetCountry: request.workspace.targetCountry,
          defaultLanguage: request.workspace.defaultLanguage,
          locale: request.workspace.locale,
          currency: request.workspace.currency,
          timezone: request.workspace.timezone,
          niche: request.workspace.niche,
        });
        await transaction.insert(memberships).values({
          organizationId: reservation.organizationId,
          userId: user.id,
          identityProviderMembershipId,
          role: "owner",
        });
        await transaction.insert(workspaceMemberships).values({
          organizationId: reservation.organizationId,
          workspaceId: reservation.workspaceId,
          userId: user.id,
          role: "workspace_admin",
        });
        await transaction.insert(workspaceOnboardingSteps).values(
          onboardingSteps.map((step, index) => ({
            organizationId: reservation.organizationId,
            workspaceId: reservation.workspaceId,
            step,
            position: index + 1,
            state:
              step === "workspace_profile"
                ? ("completed" as const)
                : step === "publishing_destination"
                  ? ("in_progress" as const)
                  : ("pending" as const),
            completedAt: step === "workspace_profile" ? now : null,
            evidence:
              step === "workspace_profile"
                ? {
                    locale: request.workspace.locale,
                    targetCountry: request.workspace.targetCountry,
                  }
                : {},
          })),
        );
        await transaction.insert(auditEvents).values([
          {
            organizationId: reservation.organizationId,
            actorUserId: user.id,
            action: "organization.created",
            targetType: "organization",
            targetId: reservation.organizationId,
            requestId,
            sourceIpHash,
            details: {
              name: request.organizationName,
              identityProviderOrganizationId,
            },
          },
          {
            organizationId: reservation.organizationId,
            workspaceId: reservation.workspaceId,
            actorUserId: user.id,
            action: "workspace.created",
            targetType: "workspace",
            targetId: reservation.workspaceId,
            requestId,
            sourceIpHash,
            details: {
              name: request.workspace.name,
              locale: request.workspace.locale,
              targetCountry: request.workspace.targetCountry,
              currency: request.workspace.currency,
              timezone: request.workspace.timezone,
              niche: request.workspace.niche,
            },
          },
          {
            organizationId: reservation.organizationId,
            workspaceId: reservation.workspaceId,
            actorUserId: user.id,
            action: "onboarding.workspace_profile.completed",
            targetType: "workspace",
            targetId: reservation.workspaceId,
            requestId,
            sourceIpHash,
            details: {
              nextStep: "publishing_destination",
            },
          },
        ]);
        await transaction
          .update(onboardingRequests)
          .set({
            status: "completed",
            identityProviderOrganizationId,
            identityProviderMembershipId,
            lastErrorCode: null,
            updatedAt: now,
          })
          .where(eq(onboardingRequests.idempotencyKey, reservation.idempotencyKey));

        return false;
      },
      actor.externalIdentityId,
    );
    replayed ||= completedByAnotherRequest;
  }

  const tenant = await resolveTenant(
    {
      ...actor,
      identityProviderOrganizationId:
        reservation.identityProviderOrganizationId ?? identityProviderOrganizationId,
    },
    reservation.workspaceId,
  );
  const result = await getOrganizationWorkspace(tenant, actor.externalIdentityId);
  return {
    ...result,
    replayed,
  };
}
