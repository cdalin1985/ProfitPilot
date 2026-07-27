import { ArrowUpFromLine, ChevronRight, FileText, Link2, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { QueueItem } from "@profit-pilot/contracts";
import { fixtureContentId } from "@profit-pilot/fixtures";

interface QueueListProps {
  items: readonly QueueItem[];
}

const queueMeta: Record<
  QueueItem["status"],
  { className: string; icon: LucideIcon; label: string }
> = {
  needs_review: {
    className: "border-primary text-primary",
    icon: FileText,
    label: "Needs review",
  },
  ready_to_publish: {
    className: "border-information text-information",
    icon: ArrowUpFromLine,
    label: "Ready to publish",
  },
  needs_reconnect: {
    className: "border-violet-500 text-violet-700",
    icon: Link2,
    label: "Needs reconnect",
  },
};

export function QueueList({ items }: QueueListProps): React.ReactNode {
  return (
    <ul className="divide-y">
      {items.map((item, index) => {
        const meta = queueMeta[item.status];
        const Icon = meta.icon;
        const href =
          item.status === "needs_reconnect" ? "/integrations" : `/content/${fixtureContentId}`;

        return (
          <li key={item.id}>
            <Link
              className={`focus-outline group flex min-h-[72px] items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/70 ${
                index === 0 ? "bg-orange-50/55 ring-1 ring-inset ring-primary/50" : ""
              }`}
              href={href}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${meta.className}`}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-5">{item.title}</span>
                <span className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                    {meta.label}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    •
                  </span>
                  <span className="truncate text-muted-foreground">{item.subject}</span>
                </span>
              </span>
              <span className="self-start whitespace-nowrap pt-1 text-xs text-muted-foreground">
                {index === 0 ? "30m ago" : index === 1 ? "2h ago" : "5h ago"}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
