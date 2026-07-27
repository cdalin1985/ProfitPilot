import { AppHeader } from "./app-header";
import { NavigationRail } from "./navigation-rail";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): React.ReactNode {
  return (
    <div className="min-h-screen bg-sidebar xl:pl-[268px]">
      <NavigationRail />
      <div className="min-h-screen bg-background">
        <AppHeader />
        {children}
      </div>
    </div>
  );
}
