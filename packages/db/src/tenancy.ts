import { and, asc, eq, ne, sql } from "drizzle-orm";

import type {
  AuthenticatedActor,
  OnboardingProgress,
  OrganizationRole,
  OrganizationWorkspace,
  SessionState,
  TenantContext,
  WorkspaceRole,
} from "@profit-pilot/contracts";

import { withActor, withTenant } from "./database.js";
import {
  memberships,
  organizations,
  workspaceMemberships,
  workspaceOnboardingSteps,
  workspaces,
} from "./schema.js";

interface ResolvedTenantRow extends Record<string, unknown> {
  organization_id: string;
  workspace_id: string;
  user_id: string;
  organization_role: OrganizationRole;
  workspace_role: WorkspaceRole | null;
}

interface ActorOrganizationRow extends Record<string, unknown> {
  id: string;
  identity_provider_organization_id: string;
  name: string;
}

interface ActorWorkspaceRow extends Record<string, unknown> {
  organization_id: string;
  organization_name: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  workspace_status: "setup" | "active" | "suspended";
}

export class TenantResolutionError extends Error {
  readonly code = "tenant_not_found";

  constructor(message = "No active tenant membership matches this request") {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export async function resolveTenant(
  actor: AuthenticatedActor,
  workspaceId: string,
): Promise<TenantContext> {
  if (!actor.identityProviderOrganizationId) {
    throw new TenantResolutionError("An active identity-provider organization is required");
  }

  const rows = await withActor(actor.externalIdentityId, (transaction) =>
    transaction.execute<ResolvedTenantRow>(sql`
      select *
      from app_private.resolve_tenant(
        ${actor.externalIdentityId},
        ${actor.identityProviderOrganizationId},
        ${workspaceId}::uuid
      )
    `),
  );
  const row = rows[0];
  if (!row) {
    throw new TenantResolutionError();
  }

  return {
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    organizationRole: row.organization_role,
    workspaceRole: row.workspace_role,
  };
}

export async function listActorOrganizations(
  externalIdentityId: string,
): Promise<Extract<SessionState, { status: "organization_selection_required" }>["organizations"]> {
  const rows = await withActor(externalIdentityId, (transaction) =>
    transaction.execute<ActorOrganizationRow>(sql`
      select *
      from app_private.list_actor_organizations(${externalIdentityId})
    `),
  );

  return rows.map((row) => ({
    id: row.id,
    identityProviderOrganizationId: row.identity_provider_organization_id,
    name: row.name,
  }));
}

export async function listActorWorkspaces(
  actor: AuthenticatedActor,
): Promise<Extract<SessionState, { status: "workspace_selection_required" }>> {
  if (!actor.identityProviderOrganizationId) {
    throw new TenantResolutionError("An active identity-provider organization is required");
  }

  const rows = await withActor(actor.externalIdentityId, (transaction) =>
    transaction.execute<ActorWorkspaceRow>(sql`
      select *
      from app_private.list_actor_workspaces(
        ${actor.externalIdentityId},
        ${actor.identityProviderOrganizationId}
      )
    `),
  );
  const first = rows[0];
  if (!first) {
    throw new TenantResolutionError(
      "No active local organization membership matches the identity-provider session",
    );
  }

  return {
    status: "workspace_selection_required",
    organization: {
      id: first.organization_id,
      identityProviderOrganizationId: actor.identityProviderOrganizationId,
      name: first.organization_name,
    },
    workspaces: rows.map((row) => ({
      id: row.workspace_id,
      name: row.workspace_name,
      slug: row.workspace_slug,
      status: row.workspace_status,
    })),
  };
}

function deriveOnboardingProgress(
  steps: {
    step: OrganizationWorkspace["onboarding"]["currentStep"];
    position: number;
    state: OrganizationWorkspace["onboarding"]["steps"][number]["state"];
    completedAt: Date | null;
  }[],
): OnboardingProgress {
  const orderedSteps = steps.map((step) => ({
    step: step.step,
    position: step.position,
    state: step.state,
    completedAt: step.completedAt?.toISOString() ?? null,
  }));
  const blocked = orderedSteps.find((step) => step.state === "blocked");
  const current = blocked ?? orderedSteps.find((step) => step.state !== "completed");
  const finalStep = orderedSteps.at(-1);

  if (!current && finalStep) {
    return {
      status: "completed",
      currentStep: finalStep.step,
      steps: orderedSteps,
    };
  }
  if (!current) {
    throw new TenantResolutionError("Workspace onboarding progress is missing");
  }

  const priorStepsComplete = orderedSteps
    .filter((step) => step.position < current.position)
    .every((step) => step.state === "completed");

  return {
    status:
      current.state === "blocked"
        ? "blocked"
        : current.step === "workspace_activation" && priorStepsComplete
          ? "ready_for_activation"
          : "in_progress",
    currentStep: current.step,
    steps: orderedSteps,
  };
}

export async function getOrganizationWorkspace(
  context: TenantContext,
  externalIdentityId?: string,
): Promise<OrganizationWorkspace> {
  return withTenant(
    context.organizationId,
    context.workspaceId,
    async (transaction) => {
      const [organization] = await transaction
        .select({
          id: organizations.id,
          identityProviderOrganizationId: organizations.identityProviderOrganizationId,
          name: organizations.name,
          slug: organizations.slug,
          role: sql<OrganizationRole>`${memberships.role}`,
        })
        .from(organizations)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, organizations.id),
            eq(memberships.userId, context.userId),
            eq(memberships.status, "active"),
          ),
        )
        .where(eq(organizations.id, context.organizationId))
        .limit(1);

      const [workspace] = await transaction
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          targetCountry: workspaces.targetCountry,
          defaultLanguage: workspaces.defaultLanguage,
          locale: workspaces.locale,
          currency: workspaces.currency,
          timezone: workspaces.timezone,
          niche: workspaces.niche,
          status: workspaces.status,
          role: workspaceMemberships.role,
        })
        .from(workspaces)
        .leftJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, workspaces.id),
            eq(workspaceMemberships.userId, context.userId),
            eq(workspaceMemberships.status, "active"),
          ),
        )
        .where(
          and(
            eq(workspaces.organizationId, context.organizationId),
            eq(workspaces.id, context.workspaceId),
          ),
        )
        .limit(1);

      const steps = await transaction
        .select({
          step: workspaceOnboardingSteps.step,
          position: workspaceOnboardingSteps.position,
          state: workspaceOnboardingSteps.state,
          completedAt: workspaceOnboardingSteps.completedAt,
        })
        .from(workspaceOnboardingSteps)
        .where(eq(workspaceOnboardingSteps.workspaceId, context.workspaceId))
        .orderBy(asc(workspaceOnboardingSteps.position));

      if (!organization || !workspace) {
        throw new TenantResolutionError();
      }

      return {
        organization,
        workspace,
        onboarding: deriveOnboardingProgress(steps),
      };
    },
    externalIdentityId,
  );
}

export async function listAvailableWorkspaces(
  context: TenantContext,
  externalIdentityId?: string,
): Promise<Extract<SessionState, { status: "active" }>["availableWorkspaces"]> {
  return withTenant(
    context.organizationId,
    context.workspaceId,
    async (transaction) => {
      const columns = {
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        status: workspaces.status,
      };

      if (
        context.organizationRole === "owner" ||
        context.organizationRole === "organization_admin"
      ) {
        const rows = await transaction
          .select(columns)
          .from(workspaces)
          .where(
            and(
              eq(workspaces.organizationId, context.organizationId),
              ne(workspaces.status, "archived"),
            ),
          )
          .orderBy(asc(workspaces.name));
        return rows.filter(
          (
            workspace,
          ): workspace is typeof workspace & {
            status: "setup" | "active" | "suspended";
          } => workspace.status !== "archived",
        );
      }

      const rows = await transaction
        .select(columns)
        .from(workspaces)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, workspaces.id),
            eq(workspaceMemberships.userId, context.userId),
            eq(workspaceMemberships.status, "active"),
          ),
        )
        .where(
          and(
            eq(workspaces.organizationId, context.organizationId),
            ne(workspaces.status, "archived"),
          ),
        )
        .orderBy(asc(workspaces.name));
      return rows.filter(
        (
          workspace,
        ): workspace is typeof workspace & {
          status: "setup" | "active" | "suspended";
        } => workspace.status !== "archived",
      );
    },
    externalIdentityId,
  );
}
