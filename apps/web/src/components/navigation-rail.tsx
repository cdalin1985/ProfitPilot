import { NavigationList } from "./navigation-list";
import { ProfitPilotMark } from "./profit-pilot-mark";
import { WorkspaceSwitcher, type WorkspaceNavigationContext } from "./workspace-switcher";

export function NavigationRail({
  workspaceContext,
}: {
  workspaceContext: WorkspaceNavigationContext;
}): React.ReactNode {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] flex-col bg-sidebar text-sidebar-foreground xl:flex">
      <div className="flex h-20 items-center px-5 text-primary">
        <ProfitPilotMark className="[&>span]:text-white" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3">
        <NavigationList kind="primary" />
        <div className="mt-auto border-t border-sidebar-border pt-4">
          <NavigationList kind="support" />
        </div>
      </div>
      <div className="mt-4 border-t border-sidebar-border p-3">
        <WorkspaceSwitcher inverse workspaceContext={workspaceContext} />
      </div>
    </aside>
  );
}
