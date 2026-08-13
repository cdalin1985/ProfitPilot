import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CreateContentButton } from "@/components/overview/create-content-button";
import { ModulePage } from "@/components/module-page";
import { getActiveOverview } from "@/lib/overview-context";
import { relativeTime } from "@/lib/relative-time";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

export default async function ContentPage(): Promise<React.ReactNode> {
  const { overview } = await getActiveOverview();
  const contentItems = overview.queue.filter((item) => item.status !== "needs_reconnect");

  return (
    <ModulePage
      actions={<CreateContentButton />}
      description="Create, validate, approve, schedule, and publish grounded affiliate content."
      title="Content"
    >
      <div className="border-y">
        <div className="grid grid-cols-[1fr_150px_120px_28px] gap-4 border-b px-3 py-3 text-xs font-semibold text-muted-foreground">
          <span>Title</span>
          <span>Status</span>
          <span>Updated</span>
          <span className="sr-only">Open</span>
        </div>
        {contentItems.map((item) => (
          <Link
            className="focus-outline grid min-h-20 grid-cols-[1fr_150px_120px_28px] items-center gap-4 rounded px-3 py-3 hover:bg-muted/55"
            href={item.href}
            key={item.id}
          >
            <span>
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.subject}</span>
            </span>
            <span className="text-sm">
              {item.status === "needs_review" ? "In review" : "Approved"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {relativeTime(item.occurredAt, overview.generatedAt)}
            </span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </ModulePage>
  );
}
