import { AppHeader } from "./app-header";
import { NavigationRail } from "./navigation-rail";
import type { WorkspaceNavigationContext } from "./workspace-switcher";
import type { SessionState } from "@profit-pilot/contracts";
import type { WebUser } from "@/lib/auth";

interface AppShellProps {
  children: React.ReactNode;
  session: Extract<SessionState, { status: "active" }>;
  user: WebUser;
}

export function AppShell({ children, session, user }: AppShellProps): React.ReactNode {
  const workspaceContext: WorkspaceNavigationContext = {
    organizationName: session.active.organization.name,
    activeWorkspace: {
      id: session.active.workspace.id,
      name: session.active.workspace.name,
    },
    workspaces: session.availableWorkspaces,
  };

  return (
    <div className="min-h-screen bg-sidebar xl:pl-[268px]">
      <NavigationRail workspaceContext={workspaceContext} />
      <div className="min-h-screen bg-background">
        <AppHeader user={user} workspaceContext={workspaceContext} />
        {children}
      </div>
    </div>
  );
}
