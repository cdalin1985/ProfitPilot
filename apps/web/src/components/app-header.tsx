"use client";

import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/session-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WebUser } from "@/lib/auth";

import { MobileNavigation } from "./mobile-navigation";
import { WorkspaceSwitcher, type WorkspaceNavigationContext } from "./workspace-switcher";

export function AppHeader({
  workspaceContext,
  user,
}: {
  workspaceContext: WorkspaceNavigationContext;
  user: WebUser;
}): React.ReactNode {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center border-b bg-background px-4 sm:px-6 xl:px-8">
      <div className="flex items-center gap-2 xl:hidden">
        <MobileNavigation workspaceContext={workspaceContext} />
        <div className="hidden min-w-56 sm:block">
          <WorkspaceSwitcher workspaceContext={workspaceContext} />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus-outline flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted">
            <Avatar className="size-8">
              {user.profilePictureUrl && <AvatarImage alt="" src={user.profilePictureUrl} />}
              <AvatarFallback className="bg-foreground text-[11px] font-semibold text-background">
                {user.initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">{user.displayName}</span>
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block">{user.displayName}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">Security</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={signOutAction} className="w-full">
                <button className="flex w-full items-center gap-2 text-left" type="submit">
                  <LogOut aria-hidden="true" className="size-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
