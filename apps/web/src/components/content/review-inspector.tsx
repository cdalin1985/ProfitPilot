"use client";

import { CheckCircle2, FileCheck2, Globe2, Info, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ContentReview } from "@profit-pilot/contracts";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ReviewInspectorProps {
  approved: boolean;
  content: ContentReview;
}

export function ReviewInspector({ approved, content }: ReviewInspectorProps): React.ReactNode {
  const [tab, setTab] = useState("checks");

  return (
    <div className="flex h-full flex-col">
      <Tabs className="flex min-h-0 flex-1 flex-col" onValueChange={setTab} value={tab}>
        <TabsList className="h-12 w-full justify-start rounded-none border-b bg-background px-4">
          <TabsTrigger value="checks">Checks</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>
        <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto p-5" value="checks">
          <h2 className="text-base font-semibold">Validation summary</h2>
          <dl className="mt-4 space-y-3">
            {content.validationChecks.map((check) => (
              <div className="flex items-center justify-between gap-3 text-sm" key={check.key}>
                <dt className="text-muted-foreground">{check.label}</dt>
                <dd className="flex items-center gap-2 font-medium text-healthy">
                  {check.result}
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Evidence for selected claim</h2>
              <span className="flex size-6 items-center justify-center rounded border font-mono text-xs">
                {content.evidence.length}
              </span>
            </div>
            <ul className="mt-3 divide-y">
              {content.evidence.map((evidence) => {
                const Icon = evidence.sourceType === "network_feed" ? FileCheck2 : Globe2;
                return (
                  <li className="flex items-start gap-3 py-3" key={evidence.id}>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-information">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{evidence.label}</span>
                      <span className="mt-1 block font-mono text-xs text-muted-foreground">
                        Observed Jul {evidence.sourceType === "network_feed" ? "27" : "26"}, 2026
                      </span>
                    </span>
                    <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs text-healthy">
                      Supports
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium">
              {content.unresolvedComments} unresolved comments
            </span>
            <Button onClick={() => setTab("comments")} size="sm" variant="outline">
              Open comments
            </Button>
          </div>
          <div className="mt-5 rounded-lg border bg-muted/45 p-4">
            <div className="flex items-start gap-3">
              <Info aria-hidden="true" className="mt-0.5 size-5" />
              <div>
                <p className="text-sm font-semibold">
                  {approved ? "Approval recorded." : "Publish will be enabled after approval."}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {approved
                    ? "Connect and verify a WordPress destination before creating a draft."
                    : "Approval is required before a verified destination can receive a draft."}
                </p>
              </div>
            </div>
            {approved ? (
              <Button asChild className="mt-4 w-full">
                <Link href="/integrations">Connect WordPress</Link>
              </Button>
            ) : (
              <Button className="mt-4 w-full" disabled variant="outline">
                Create WordPress draft
              </Button>
            )}
          </div>
        </TabsContent>
        <TabsContent className="m-0 p-5" value="evidence">
          <h2 className="text-base font-semibold">Evidence</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Two current sources support the selected retention claim. Source text is stored by hash
            with its observation time.
          </p>
        </TabsContent>
        <TabsContent className="m-0 p-5" value="comments">
          <div className="flex items-center gap-2">
            <MessageSquareText aria-hidden="true" className="size-5" />
            <h2 className="text-base font-semibold">Comments</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Two editorial comments require resolution before automated scheduling can be enabled.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
