import "server-only";

import { notFound } from "next/navigation";

import { getActiveWorkspaceSession } from "./active-session";
import { requireWebAuth } from "./auth";
import { getOverview } from "./profit-pilot-api";

export async function getActiveOverview() {
  const auth = await requireWebAuth();
  const session = await getActiveWorkspaceSession(auth);
  if (session.status !== "active") notFound();
  const overview = await getOverview(auth, session.tenant.workspaceId);
  return { overview, session };
}
