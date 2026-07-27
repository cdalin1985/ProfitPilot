import { ChevronRight, Layers3 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { selectWorkspaceAction } from "@/app/session-actions";
import { SessionSelectionShell } from "@/components/session-selection-shell";
import { Button } from "@/components/ui/button";
import { requireWebAuth } from "@/lib/auth";
import { getApplicationSession } from "@/lib/profit-pilot-api";
import { routeForIncompleteSession } from "@/lib/session-routing";

export const metadata: Metadata = {
  title: "Choose a workspace",
};

export default async function SelectWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}): Promise<React.ReactNode> {
  const auth = await requireWebAuth();
  const session = await getApplicationSession(auth);
  if (session.status !== "workspace_selection_required") {
    redirect(routeForIncompleteSession(session) ?? "/overview");
  }
  const hasError = Boolean((await searchParams).error);

  return (
    <SessionSelectionShell
      description={`Choose a workspace inside ${session.organization.name}. This selection is stored in an HttpOnly cookie and revalidated on every API request.`}
      error={
        hasError
          ? "That workspace is unavailable or your access changed. Choose another workspace or contact an administrator."
          : undefined
      }
      eyebrow="Workspace boundary"
      title="Choose where to work"
    >
      {session.workspaces.map((workspace) => {
        const suspended = workspace.status === "suspended";
        return (
          <form action={selectWorkspaceAction} key={workspace.id}>
            <input name="workspaceId" type="hidden" value={workspace.id} />
            <Button
              className="h-auto w-full justify-start gap-4 p-4 text-left"
              disabled={suspended}
              type="submit"
              variant="outline"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <Layers3 aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{workspace.name}</span>
                <span className="mt-1 block text-xs font-normal capitalize text-muted-foreground">
                  {suspended ? "Suspended — administrator action required" : workspace.status}
                </span>
              </span>
              {!suspended && <ChevronRight aria-hidden="true" />}
            </Button>
          </form>
        );
      })}
    </SessionSelectionShell>
  );
}
