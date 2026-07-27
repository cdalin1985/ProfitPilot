"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { selectWorkspaceAction } from "@/app/session-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export interface WorkspaceNavigationContext {
  organizationName: string;
  activeWorkspace: {
    id: string;
    name: string;
  };
  workspaces: {
    id: string;
    name: string;
    status: "setup" | "active" | "suspended";
  }[];
}

interface WorkspaceSwitcherProps {
  workspaceContext: WorkspaceNavigationContext;
  inverse?: boolean;
}

export function WorkspaceSwitcher({
  workspaceContext,
  inverse = false,
}: WorkspaceSwitcherProps): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`focus-outline flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
          inverse
            ? "text-sidebar-foreground hover:bg-sidebar-accent"
            : "text-foreground hover:bg-muted"
        }`}
      >
        <Building2 aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {workspaceContext.organizationName}
          </span>
          <span
            className={`block truncate text-xs ${
              inverse ? "text-sidebar-foreground/65" : "text-muted-foreground"
            }`}
          >
            {workspaceContext.activeWorkspace.name}
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{workspaceContext.organizationName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaceContext.workspaces.map((workspace) => {
          const current = workspace.id === workspaceContext.activeWorkspace.id;
          const suspended = workspace.status === "suspended";
          return (
            <DropdownMenuItem asChild disabled={suspended} key={workspace.id}>
              <form action={selectWorkspaceAction} className="w-full">
                <input name="workspaceId" type="hidden" value={workspace.id} />
                <button
                  className="flex w-full items-center gap-2 text-left"
                  disabled={suspended}
                  type="submit"
                >
                  <span className="flex size-4 items-center justify-center">
                    {current && <Check aria-hidden="true" className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {suspended && <span className="text-xs text-muted-foreground">Suspended</span>}
                </button>
              </form>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
