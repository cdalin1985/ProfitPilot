import "server-only";

import { cookies } from "next/headers";

import { identifierSchema } from "@profit-pilot/contracts";

export const activeWorkspaceCookieName = "profit-pilot-workspace";
export const activeWorkspaceCookiePath = "/";

export async function getActiveWorkspaceId(): Promise<string | undefined> {
  const value = (await cookies()).get(activeWorkspaceCookieName)?.value;
  const parsed = identifierSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  const validatedWorkspaceId = identifierSchema.parse(workspaceId);
  (await cookies()).set(activeWorkspaceCookieName, validatedWorkspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: activeWorkspaceCookiePath,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveWorkspaceId(): Promise<void> {
  (await cookies()).delete(activeWorkspaceCookieName);
}
