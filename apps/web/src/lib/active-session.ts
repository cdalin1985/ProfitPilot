import "server-only";

import { redirect } from "next/navigation";

import type { SessionState } from "@profit-pilot/contracts";

import type { WebAuth } from "./auth";
import { getApplicationSession, ProfitPilotApiError } from "./profit-pilot-api";
import { getActiveWorkspaceId } from "./workspace-cookie";

export async function getActiveWorkspaceSession(auth: WebAuth): Promise<SessionState> {
  const workspaceId = await getActiveWorkspaceId();

  try {
    return await getApplicationSession(auth, workspaceId);
  } catch (error) {
    if (workspaceId && error instanceof ProfitPilotApiError && error.status === 403) {
      redirect("/session/recover");
    }
    throw error;
  }
}
