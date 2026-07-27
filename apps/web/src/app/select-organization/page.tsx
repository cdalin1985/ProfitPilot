import { Building2, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { selectOrganizationAction } from "@/app/session-actions";
import { SessionSelectionShell } from "@/components/session-selection-shell";
import { Button } from "@/components/ui/button";
import { requireWebAuth } from "@/lib/auth";
import { getApplicationSession } from "@/lib/profit-pilot-api";
import { routeForIncompleteSession } from "@/lib/session-routing";

export const metadata: Metadata = {
  title: "Choose an organization",
};

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}): Promise<React.ReactNode> {
  const auth = await requireWebAuth();
  const session = await getApplicationSession(auth);
  if (session.status !== "organization_selection_required") {
    redirect(routeForIncompleteSession(session) ?? "/overview");
  }
  const hasError = Boolean((await searchParams).error);

  return (
    <SessionSelectionShell
      description="Choose the organization context for this session. Roles and workspace access are revalidated by Profit Pilot after selection."
      error={
        hasError
          ? "That organization could not be activated. Retry, or ask an administrator to verify your membership."
          : undefined
      }
      eyebrow="Session context"
      title="Choose an organization"
    >
      {session.organizations.map((organization) => (
        <form action={selectOrganizationAction} key={organization.id}>
          <input
            name="organizationId"
            type="hidden"
            value={organization.identityProviderOrganizationId}
          />
          <Button
            className="h-auto w-full justify-start gap-4 p-4 text-left"
            type="submit"
            variant="outline"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Building2 aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{organization.name}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Membership verified
              </span>
            </span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </form>
      ))}
    </SessionSelectionShell>
  );
}
