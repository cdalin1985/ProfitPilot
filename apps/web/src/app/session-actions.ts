"use server";

import { refreshSession, signOut } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { identifierSchema } from "@profit-pilot/contracts";

import { requireWebAuth } from "@/lib/auth";
import { getWebAuthMode } from "@/lib/auth-mode";
import { getApplicationSession } from "@/lib/profit-pilot-api";
import { clearActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/workspace-cookie";

const organizationIdSchema = z.string().min(1).max(255);

export async function selectOrganizationAction(formData: FormData): Promise<never> {
  const selected = organizationIdSchema.safeParse(formData.get("organizationId"));
  if (!selected.success) {
    redirect("/select-organization?error=invalid");
  }

  const auth = await requireWebAuth();
  const session = await getApplicationSession(auth);
  if (
    session.status !== "organization_selection_required" ||
    !session.organizations.some(
      (organization) => organization.identityProviderOrganizationId === selected.data,
    )
  ) {
    redirect("/select-organization?error=unavailable");
  }

  try {
    await refreshSession({
      organizationId: selected.data,
      ensureSignedIn: true,
    });
    await clearActiveWorkspaceId();
  } catch {
    redirect("/select-organization?error=refresh");
  }
  redirect("/");
}

export async function selectWorkspaceAction(formData: FormData): Promise<never> {
  const selected = identifierSchema.safeParse(formData.get("workspaceId"));
  if (!selected.success) {
    redirect("/select-workspace?error=invalid");
  }

  try {
    const auth = await requireWebAuth();
    const session = await getApplicationSession(auth, selected.data);
    if (session.status !== "active" || session.active.workspace.id !== selected.data) {
      redirect("/select-workspace?error=unavailable");
    }
    await setActiveWorkspaceId(selected.data);
  } catch {
    redirect("/select-workspace?error=unavailable");
  }
  redirect("/overview");
}

export async function signOutAction(): Promise<never> {
  await clearActiveWorkspaceId();
  if (getWebAuthMode() === "oidc") {
    await signOut({ returnTo: "/" });
  }
  redirect("/");
}
