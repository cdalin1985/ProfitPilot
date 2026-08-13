import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import type {
  ActivationRequest,
  AuthenticatedActor,
  BetaAdmission,
  BetaInvite,
  CreateBetaInvite,
  IssuedBetaInvite,
  TenantContext,
} from "@profit-pilot/contracts";

import { getDatabase, withTenant, type DatabaseTransaction } from "./database.js";
import {
  affiliateConnections,
  auditEvents,
  betaInvites,
  contentRevisions,
  evidenceRecords,
  products,
  publications,
  publishingDestinations,
  workspaceActivationRequests,
  workspaceOnboardingSteps,
  workspaces,
} from "./schema.js";

export class BetaInviteError extends Error {
  readonly code = "beta_invite_invalid";
  constructor(message = "The private-beta invitation is invalid or unavailable") {
    super(message);
    this.name = "BetaInviteError";
  }
}

export class WorkspaceActivationError extends Error {
  readonly code = "workspace_activation_blocked";
  constructor(message = "The workspace is not ready for activation") {
    super(message);
    this.name = "WorkspaceActivationError";
  }
}

const digest = (token: string): string => createHash("sha256").update(token).digest("hex");
const inviteView = (row: typeof betaInvites.$inferSelect): BetaInvite => ({
  id: row.id,
  email: row.email,
  status: row.status,
  expiresAt: row.expiresAt.toISOString(),
  acceptedAt: row.acceptedAt?.toISOString() ?? null,
});

async function withBetaOperator<T>(
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.beta_operator', 'true', true)`);
    return operation(transaction);
  });
}

async function withBetaActor<T>(
  actor: AuthenticatedActor,
  email: string,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('app.current_actor_external_id', ${actor.externalIdentityId}, true)`,
    );
    await transaction.execute(
      sql`select set_config('app.current_actor_email', ${email.toLowerCase()}, true)`,
    );
    return operation(transaction);
  });
}

export async function issueBetaInvite(
  input: CreateBetaInvite,
  now = new Date(),
): Promise<IssuedBetaInvite> {
  const token = randomBytes(32).toString("base64url");
  return withBetaOperator(async (transaction) => {
    const [row] = await transaction
      .insert(betaInvites)
      .values({
        email: input.email.toLowerCase(),
        tokenDigest: digest(token),
        expiresAt: new Date(now.getTime() + input.expiresInDays * 86_400_000),
      })
      .returning();
    if (!row) throw new BetaInviteError();
    return { ...inviteView(row), token };
  });
}

export async function rotateBetaInvite(
  inviteId: string,
  expiresInDays: number,
  now = new Date(),
): Promise<IssuedBetaInvite> {
  const token = randomBytes(32).toString("base64url");
  return withBetaOperator(async (transaction) => {
    const [row] = await transaction
      .update(betaInvites)
      .set({
        tokenDigest: digest(token),
        tokenVersion: sql`${betaInvites.tokenVersion} + 1`,
        expiresAt: new Date(now.getTime() + expiresInDays * 86_400_000),
        updatedAt: now,
      })
      .where(and(eq(betaInvites.id, inviteId), eq(betaInvites.status, "pending")))
      .returning();
    if (!row) throw new BetaInviteError("Only a pending invitation can be rotated");
    return { ...inviteView(row), token };
  });
}

export async function acceptBetaInvite(
  actor: AuthenticatedActor,
  verifiedEmail: string,
  token: string,
  now = new Date(),
): Promise<BetaAdmission> {
  return withBetaActor(actor, verifiedEmail, async (transaction) => {
    const [row] = await transaction
      .select()
      .from(betaInvites)
      .where(eq(betaInvites.tokenDigest, digest(token)))
      .limit(1);
    if (
      !row ||
      row.email !== verifiedEmail.toLowerCase() ||
      row.status !== "pending" ||
      row.expiresAt <= now
    )
      throw new BetaInviteError();
    const [accepted] = await transaction
      .update(betaInvites)
      .set({
        status: "accepted",
        acceptedByExternalIdentityId: actor.externalIdentityId,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(and(eq(betaInvites.id, row.id), eq(betaInvites.status, "pending")))
      .returning();
    if (!accepted) throw new BetaInviteError();
    return { admitted: true, inviteId: accepted.id, acceptedAt: now.toISOString() };
  });
}

export async function getBetaAdmission(
  actor: AuthenticatedActor,
  verifiedEmail: string,
): Promise<BetaAdmission> {
  return withBetaActor(actor, verifiedEmail, async (transaction) => {
    const [row] = await transaction
      .select()
      .from(betaInvites)
      .where(
        and(
          eq(betaInvites.email, verifiedEmail.toLowerCase()),
          eq(betaInvites.acceptedByExternalIdentityId, actor.externalIdentityId),
          eq(betaInvites.status, "accepted"),
        ),
      )
      .limit(1);
    return row
      ? { admitted: true, inviteId: row.id, acceptedAt: row.acceptedAt?.toISOString() ?? null }
      : { admitted: false, inviteId: null, acceptedAt: null };
  });
}

export interface WorkspaceReadiness {
  ready: boolean;
  checks: Record<string, boolean>;
}

export async function reconcileWorkspaceOnboarding(
  context: TenantContext,
): Promise<WorkspaceReadiness> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const [workspace] = await transaction
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, context.workspaceId))
      .limit(1);
    if (!workspace) throw new WorkspaceActivationError("Workspace not found");
    const [destination] = await transaction
      .select({ id: publishingDestinations.id })
      .from(publishingDestinations)
      .where(
        and(
          eq(publishingDestinations.workspaceId, context.workspaceId),
          eq(publishingDestinations.status, "active"),
        ),
      )
      .limit(1);
    const [affiliate] = await transaction
      .select({ id: affiliateConnections.id })
      .from(affiliateConnections)
      .where(
        and(
          eq(affiliateConnections.workspaceId, context.workspaceId),
          eq(affiliateConnections.status, "active"),
        ),
      )
      .limit(1);
    const [product] = await transaction
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.workspaceId, context.workspaceId), eq(products.available, true)))
      .limit(1);
    const [revision] = await transaction
      .select({ id: contentRevisions.id })
      .from(contentRevisions)
      .where(eq(contentRevisions.workspaceId, context.workspaceId))
      .limit(1);
    const [evidence] = await transaction
      .select({ id: evidenceRecords.id })
      .from(evidenceRecords)
      .where(eq(evidenceRecords.workspaceId, context.workspaceId))
      .limit(1);
    const [publication] = await transaction
      .select({ id: publications.id })
      .from(publications)
      .where(
        and(
          eq(publications.workspaceId, context.workspaceId),
          eq(publications.status, "draft_created"),
        ),
      )
      .limit(1);
    const [brandPolicy] = await transaction
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, context.workspaceId),
          eq(auditEvents.action, "brand_policy.approved"),
        ),
      )
      .limit(1);
    const checks: Record<string, boolean> = {
      workspace_profile: Boolean(
        workspace.name && workspace.locale && workspace.currency && workspace.niche,
      ),
      publishing_destination: Boolean(destination),
      affiliate_connection: Boolean(affiliate),
      brand_policy: Boolean(brandPolicy),
      sample_import: Boolean(product),
      evidence_backed_draft: Boolean(revision && evidence),
      destination_draft: Boolean(publication),
      destination_verification: Boolean(destination),
    };
    for (const [step, complete] of Object.entries(checks)) {
      await transaction
        .update(workspaceOnboardingSteps)
        .set({
          state: complete ? "completed" : "pending",
          completedAt: complete ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaceOnboardingSteps.workspaceId, context.workspaceId),
            eq(workspaceOnboardingSteps.step, step as never),
          ),
        );
    }
    return { ready: Object.values(checks).every(Boolean), checks };
  });
}

const activationView = (
  row: typeof workspaceActivationRequests.$inferSelect,
): ActivationRequest => ({
  id: row.id,
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  status: row.status,
  readiness: row.readinessSnapshot as ActivationRequest["readiness"],
  requestedAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
});

export async function requestWorkspaceActivation(
  context: TenantContext,
  idempotencyKey: string,
): Promise<ActivationRequest> {
  const readiness = await reconcileWorkspaceOnboarding(context);
  if (!readiness.ready) throw new WorkspaceActivationError();
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const fingerprint = digest(JSON.stringify({ workspaceId: context.workspaceId }));
    const [existing] = await transaction
      .select()
      .from(workspaceActivationRequests)
      .where(
        and(
          eq(workspaceActivationRequests.workspaceId, context.workspaceId),
          eq(workspaceActivationRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint)
        throw new WorkspaceActivationError("Idempotency conflict");
      return activationView(existing);
    }
    const [created] = await transaction
      .insert(workspaceActivationRequests)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        requestedByUserId: context.userId,
        readinessSnapshot: readiness,
        idempotencyKey,
        requestFingerprint: fingerprint,
      })
      .returning();
    if (!created) throw new WorkspaceActivationError();
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "workspace.activation_requested",
      targetType: "workspace",
      targetId: context.workspaceId,
      details: { activationRequestId: created.id, readiness },
    });
    return activationView(created);
  });
}

export async function operatorActivateWorkspace(
  requestId: string,
  operatorId: string,
): Promise<ActivationRequest> {
  const request = await withBetaOperator(
    async (transaction) =>
      (
        await transaction
          .select()
          .from(workspaceActivationRequests)
          .where(
            and(
              eq(workspaceActivationRequests.id, requestId),
              eq(workspaceActivationRequests.status, "requested"),
            ),
          )
          .limit(1)
      )[0],
  );
  if (!request) throw new WorkspaceActivationError("Activation request not found");
  const context: TenantContext = {
    organizationId: request.organizationId,
    workspaceId: request.workspaceId,
    userId: request.requestedByUserId ?? request.organizationId,
    organizationRole: "owner",
    workspaceRole: "workspace_admin",
  };
  const readiness = await reconcileWorkspaceOnboarding(context);
  if (!readiness.ready)
    throw new WorkspaceActivationError("Readiness changed after the activation request");
  return withBetaOperator(async (transaction) => {
    const now = new Date();
    const [updated] = await transaction
      .update(workspaceActivationRequests)
      .set({
        status: "approved",
        readinessSnapshot: readiness,
        decidedBy: operatorId,
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workspaceActivationRequests.id, requestId),
          eq(workspaceActivationRequests.status, "requested"),
        ),
      )
      .returning();
    if (!updated) throw new WorkspaceActivationError();
    await transaction
      .update(workspaces)
      .set({ status: "active", activatedAt: now, updatedAt: now })
      .where(eq(workspaces.id, request.workspaceId));
    await transaction
      .update(workspaceOnboardingSteps)
      .set({ state: "completed", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(workspaceOnboardingSteps.workspaceId, request.workspaceId),
          eq(workspaceOnboardingSteps.step, "workspace_activation"),
        ),
      );
    await transaction.insert(auditEvents).values({
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      action: "workspace.activated",
      targetType: "workspace",
      targetId: request.workspaceId,
      details: { activationRequestId: requestId, operatorId },
    });
    return activationView(updated);
  });
}

export async function getActivationRequestForOperator(
  requestId: string,
): Promise<ActivationRequest> {
  const request = await withBetaOperator(
    async (transaction) =>
      (
        await transaction
          .select()
          .from(workspaceActivationRequests)
          .where(eq(workspaceActivationRequests.id, requestId))
          .limit(1)
      )[0],
  );
  if (!request) throw new WorkspaceActivationError("Activation request not found");
  return activationView(request);
}
