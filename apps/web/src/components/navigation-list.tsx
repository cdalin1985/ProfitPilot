"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { primaryNavigation, secondaryNavigation } from "./navigation-items";

interface NavigationListProps {
  kind: "primary" | "support";
  onNavigate?: () => void;
}

export function NavigationList({ kind, onNavigate }: NavigationListProps): React.ReactNode {
  const pathname = usePathname();
  const items = kind === "primary" ? primaryNavigation : secondaryNavigation;

  return (
    <nav aria-label={kind === "primary" ? "Primary" : "Support"}>
      <ul className="space-y-1">
        {items.map((item) => {
          const selected =
            pathname === item.href ||
            (item.href !== "/overview" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "focus-outline flex h-12 items-center gap-3 rounded-lg px-4 text-[15px] font-medium text-sidebar-foreground/88 transition-colors hover:bg-sidebar-accent/70 hover:text-white",
                  selected && "bg-sidebar-accent text-white",
                )}
                href={item.href}
                onClick={onNavigate}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
