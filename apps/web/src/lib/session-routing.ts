import type { SessionState } from "@profit-pilot/contracts";

export function routeForIncompleteSession(session: SessionState): string | undefined {
  switch (session.status) {
    case "onboarding_required":
      return "/onboarding";
    case "organization_selection_required":
      return "/select-organization";
    case "workspace_selection_required":
      return "/select-workspace";
    case "active":
      return undefined;
  }
}
