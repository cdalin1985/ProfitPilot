import { createHash, timingSafeEqual } from "node:crypto";

import type {
  ActivationRequest,
  AuthenticatedActor,
  BetaAdmission,
  CreateBetaInvite,
  IssuedBetaInvite,
  TenantContext,
} from "@profit-pilot/contracts";
import {
  acceptBetaInvite,
  getActivationRequestForOperator,
  getBetaAdmission,
  issueBetaInvite,
  operatorActivateWorkspace,
  requestWorkspaceActivation,
  rotateBetaInvite,
} from "@profit-pilot/db";

import type { ApiConfig } from "./config.js";
import type { IdentityAdmin } from "./identity-admin.js";

export interface EntitlementFeatureGate {
  assertWorkspaceEligible(input: { organizationId: string; workspaceId: string }): Promise<void>;
}

export interface BetaAdmissionService {
  assertOperator(key: string | undefined): void;
  issue(input: CreateBetaInvite): Promise<IssuedBetaInvite>;
  rotate(inviteId: string, expiresInDays: number): Promise<IssuedBetaInvite>;
  accept(actor: AuthenticatedActor, token: string): Promise<BetaAdmission>;
  get(actor: AuthenticatedActor): Promise<BetaAdmission>;
  assertAdmitted(actor: AuthenticatedActor): Promise<void>;
  requestActivation(context: TenantContext, idempotencyKey: string): Promise<ActivationRequest>;
  activate(requestId: string, operatorId: string): Promise<ActivationRequest>;
}

export class BetaAdmissionRequiredError extends Error {
  readonly code = "beta_admission_required";
  constructor(message = "A valid accepted private-beta invitation is required") {
    super(message);
    this.name = "BetaAdmissionRequiredError";
  }
}

const constantEqual = (left: string, right: string): boolean => {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
};

export function createBetaAdmissionService(
  config: ApiConfig,
  identityAdmin: IdentityAdmin,
  entitlementGate: EntitlementFeatureGate = { async assertWorkspaceEligible() {} },
): BetaAdmissionService {
  const profile = async (actor: AuthenticatedActor) => {
    const value = await identityAdmin.getUser(actor.externalIdentityId);
    if (!value.emailVerified)
      throw new BetaAdmissionRequiredError(
        "Verify the account email before accepting a beta invitation",
      );
    return value;
  };
  const developmentAdmission: BetaAdmission = { admitted: true, inviteId: null, acceptedAt: null };
  return {
    assertOperator(key) {
      if (!config.BETA_OPERATOR_KEY || !key || !constantEqual(key, config.BETA_OPERATOR_KEY))
        throw new BetaAdmissionRequiredError("Operator authorization failed");
    },
    async issue(input) {
      if (!config.DATABASE_URL)
        throw new BetaAdmissionRequiredError("Private-beta admission requires PostgreSQL");
      return issueBetaInvite(input);
    },
    async rotate(inviteId, expiresInDays) {
      if (!config.DATABASE_URL)
        throw new BetaAdmissionRequiredError("Private-beta admission requires PostgreSQL");
      return rotateBetaInvite(inviteId, expiresInDays);
    },
    async accept(actor, token) {
      if (!config.DATABASE_URL) return developmentAdmission;
      const user = await profile(actor);
      return acceptBetaInvite(actor, user.email, token);
    },
    async get(actor) {
      if (!config.DATABASE_URL) return developmentAdmission;
      const user = await profile(actor);
      return getBetaAdmission(actor, user.email);
    },
    async assertAdmitted(actor) {
      const admission = await this.get(actor);
      if (!admission.admitted) throw new BetaAdmissionRequiredError();
    },
    requestActivation: requestWorkspaceActivation,
    async activate(requestId, operatorId) {
      const request = await getActivationRequestForOperator(requestId);
      await entitlementGate.assertWorkspaceEligible({
        organizationId: request.organizationId,
        workspaceId: request.workspaceId,
      });
      return operatorActivateWorkspace(requestId, operatorId);
    },
  };
}
