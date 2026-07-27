"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceSwitcherProps {
  inverse?: boolean;
}

export function WorkspaceSwitcher({ inverse = false }: WorkspaceSwitcherProps): React.ReactNode {
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
          <span className="block truncate text-sm font-semibold">Northstar Media</span>
          <span
            className={`block truncate text-xs ${
              inverse ? "text-sidebar-foreground/65" : "text-muted-foreground"
            }`}
          >
            US Editorial
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Northstar Media</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Check aria-hidden="true" className="size-4" />
          US Editorial
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
