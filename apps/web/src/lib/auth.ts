import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";

import { getWebAuthMode } from "./auth-mode";

export interface WebUser {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  profilePictureUrl?: string;
}

export interface WebAuth {
  user: WebUser;
  accessToken?: string;
  organizationId?: string;
  sessionId: string;
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : displayName.slice(0, 2)
  ).toUpperCase();
}

export async function requireWebAuth(): Promise<WebAuth> {
  if (getWebAuthMode() === "development") {
    return {
      user: {
        id: "user_development_owner",
        email: "owner@localhost.test",
        displayName: "Development Owner",
        initials: "DO",
      },
      sessionId: "session_development",
      organizationId: "org_development_profit_pilot",
    };
  }

  const auth = await withAuth({ ensureSignedIn: true });
  const displayName =
    auth.user.name ??
    ([auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || auth.user.email);
  return {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      displayName,
      initials: initials(displayName),
      ...(auth.user.profilePictureUrl ? { profilePictureUrl: auth.user.profilePictureUrl } : {}),
    },
    accessToken: auth.accessToken,
    sessionId: auth.sessionId,
    ...(auth.organizationId ? { organizationId: auth.organizationId } : {}),
  };
}
