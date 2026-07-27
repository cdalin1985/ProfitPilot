"use client";

import { Bell, ChevronDown } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MobileNavigation } from "./mobile-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppHeader(): React.ReactNode {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center border-b bg-background px-4 sm:px-6 xl:px-8">
      <div className="flex items-center gap-2 xl:hidden">
        <MobileNavigation />
        <div className="hidden min-w-56 sm:block">
          <WorkspaceSwitcher />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Notifications, 3 unread"
              className="relative"
              size="icon"
              variant="ghost"
            >
              <Bell aria-hidden="true" className="size-5" />
              <span className="absolute right-2 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/content">2 content items need review</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/integrations">Awin connection requires an account</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/integrations">WordPress destination requires an account</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-7 w-px bg-border" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger className="focus-outline flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted">
            <Avatar className="size-8">
              <AvatarFallback className="bg-foreground text-[11px] font-semibold text-background">
                CM
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">Casey Morgan</span>
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Casey Morgan</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">Security</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
