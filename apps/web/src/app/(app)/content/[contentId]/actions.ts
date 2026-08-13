"use server";

import { revalidatePath } from "next/cache";

import {
  approveContentRevisionSchema,
  identifierSchema,
  requestContentChangesSchema,
} from "@profit-pilot/contracts";

import { getActiveWorkspaceSession } from "@/lib/active-session";
import { requireWebAuth } from "@/lib/auth";
import {
  approveContentRevision,
  ProfitPilotApiError,
  requestContentChanges,
} from "@/lib/profit-pilot-api";

export interface ReviewActionState {
  ok: boolean;
  status?: "changes_requested" | "approved";
  message?: string;
}

async function activeContext() {
  const auth = await requireWebAuth();
  const session = await getActiveWorkspaceSession(auth);
  if (session.status !== "active") throw new Error("An active workspace is required");
  return { auth, workspaceId: session.tenant.workspaceId };
}

function actionFailure(error: unknown): ReviewActionState {
  if (error instanceof ProfitPilotApiError) {
    return { ok: false, message: error.problem.detail ?? error.problem.title };
  }
  return { ok: false, message: "The review action could not be completed. Try again." };
}

export async function approveContentAction(
  contentIdValue: string,
  revisionIdValue: string,
  idempotencyKeyValue: string,
): Promise<ReviewActionState> {
  try {
    const contentId = identifierSchema.parse(contentIdValue);
    const idempotencyKey = identifierSchema.parse(idempotencyKeyValue);
    const input = approveContentRevisionSchema.parse({ revisionId: revisionIdValue });
    const { auth, workspaceId } = await activeContext();
    const result = await approveContentRevision(
      auth,
      workspaceId,
      contentId,
      input,
      idempotencyKey,
    );
    revalidatePath(`/content/${contentId}`);
    return { ok: true, status: result.status };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestContentChangesAction(
  contentIdValue: string,
  revisionIdValue: string,
  reason: string,
  idempotencyKeyValue: string,
): Promise<ReviewActionState> {
  try {
    const contentId = identifierSchema.parse(contentIdValue);
    const idempotencyKey = identifierSchema.parse(idempotencyKeyValue);
    const input = requestContentChangesSchema.parse({
      revisionId: revisionIdValue,
      summary: reason,
      requiredChanges: [reason],
    });
    const { auth, workspaceId } = await activeContext();
    const result = await requestContentChanges(auth, workspaceId, contentId, input, idempotencyKey);
    revalidatePath(`/content/${contentId}`);
    return { ok: true, status: result.status };
  } catch (error) {
    return actionFailure(error);
  }
}
