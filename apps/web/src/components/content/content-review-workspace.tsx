"use client";

import { ArrowLeft, CheckCircle2, ClipboardCheck, ListTree } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ContentReview } from "@profit-pilot/contracts";

import {
  approveContentAction,
  requestContentChangesAction,
} from "@/app/(app)/content/[contentId]/actions";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { ArticleCanvas } from "./article-canvas";
import { DocumentOutline } from "./document-outline";
import { RequestChangesDialog } from "./request-changes-dialog";
import { ReviewInspector } from "./review-inspector";
import { WorkflowStepper } from "./workflow-stepper";

interface ContentReviewWorkspaceProps {
  canReview: boolean;
  content: ContentReview;
}

export function ContentReviewWorkspace({
  canReview,
  content,
}: ContentReviewWorkspaceProps): React.ReactNode {
  const [status, setStatus] = useState(content.status);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const approved = status === "approved";
  const actionable = canReview && status === "in_review" && !pending;

  const statusLabel: Record<ContentReview["status"], string> = {
    draft: "Draft",
    validating: "Validating",
    in_review: "In review",
    changes_requested: "Changes requested",
    approved: "Approved",
  };

  async function approve(): Promise<void> {
    setPending(true);
    setActionError(undefined);
    const result = await approveContentAction(content.id, content.revisionId, crypto.randomUUID());
    setPending(false);
    if (result.ok && result.status) setStatus(result.status);
    else setActionError(result.message);
  }

  async function requestChanges(reason: string): Promise<boolean> {
    setPending(true);
    setActionError(undefined);
    const result = await requestContentChangesAction(
      content.id,
      content.revisionId,
      reason,
      crypto.randomUUID(),
    );
    setPending(false);
    if (result.ok && result.status) {
      setStatus(result.status);
      return true;
    }
    setActionError(result.message);
    return false;
  }

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <header className="border-b px-5 py-4 sm:px-7">
        <Link
          className="focus-outline inline-flex items-center gap-1.5 rounded text-sm text-information hover:underline"
          href="/content"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Content
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[30px]">
                {content.title}
              </h1>
              <span
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  approved
                    ? "border-green-200 bg-green-50 text-healthy"
                    : status === "changes_requested"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-blue-200 bg-blue-50 text-information"
                }`}
              >
                {statusLabel[status]}
              </span>
              <span className="font-mono text-sm text-muted-foreground">v{content.revision}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button className="xl:hidden" variant="outline">
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  Review checks
                </Button>
              </SheetTrigger>
              <SheetContent className="p-0 sm:max-w-md">
                <SheetHeader className="sr-only">
                  <SheetTitle>Review checks</SheetTitle>
                  <SheetDescription>Validation evidence and comments</SheetDescription>
                </SheetHeader>
                <ReviewInspector approved={approved} content={content} />
              </SheetContent>
            </Sheet>
            <RequestChangesDialog disabled={!actionable} onSubmit={requestChanges} />
            <Button disabled={!actionable} onClick={approve}>
              {approved ? (
                <>
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Approved
                </>
              ) : pending ? (
                "Approving…"
              ) : (
                "Approve"
              )}
            </Button>
          </div>
        </div>
        {actionError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
      </header>
      <div className="scrollbar-subtle overflow-x-auto border-b">
        <WorkflowStepper current={approved ? "approved" : "review"} />
      </div>
      <div className="grid min-h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid min-w-0 lg:grid-cols-[286px_minmax(0,1fr)] xl:border-r">
          <aside className="hidden border-r lg:block">
            <DocumentOutline content={content} />
          </aside>
          <div className="min-w-0">
            <div className="border-b p-3 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <ListTree aria-hidden="true" className="size-4" />
                    Document outline
                  </Button>
                </SheetTrigger>
                <SheetContent className="p-0" side="left">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Document outline</SheetTitle>
                    <SheetDescription>Article sections and metadata</SheetDescription>
                  </SheetHeader>
                  <DocumentOutline content={content} />
                </SheetContent>
              </Sheet>
            </div>
            <ArticleCanvas content={content} />
          </div>
        </div>
        <aside className="hidden xl:block">
          <ReviewInspector approved={approved} content={content} />
        </aside>
      </div>
    </main>
  );
}
