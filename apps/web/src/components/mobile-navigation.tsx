"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { NavigationList } from "./navigation-list";
import { ProfitPilotMark } from "./profit-pilot-mark";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function MobileNavigation(): React.ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button aria-label="Open navigation" className="xl:hidden" size="icon" variant="ghost">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[290px] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        side="left"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Navigate Profit Pilot</SheetDescription>
        </SheetHeader>
        <div className="flex h-20 items-center px-5 text-primary">
          <ProfitPilotMark className="[&>span]:text-white" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <NavigationList kind="primary" onNavigate={() => setOpen(false)} />
          <div className="mt-auto border-t border-sidebar-border pt-4">
            <NavigationList kind="support" onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-4 border-t border-sidebar-border pt-3">
            <WorkspaceSwitcher inverse />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
