import { CircleAlert, Link2 } from "lucide-react";
import type { Metadata } from "next";

import { ModulePage } from "@/components/module-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Integrations" };

const integrations = [
  {
    name: "Awin",
    purpose: "Product feeds, advertiser relationships, commission reports",
  },
  {
    name: "Northstar WordPress",
    purpose: "Draft creation, reconciliation, and publication status",
  },
] as const;

export default function IntegrationsPage(): React.ReactNode {
  return (
    <ModulePage
      description="Connect authorized data sources and publishing destinations without exposing credentials."
      title="Integrations"
    >
      <div className="border-y">
        {integrations.map((integration) => (
          <div
            className="flex min-h-24 flex-col gap-4 border-b px-3 py-4 last:border-b-0 sm:flex-row sm:items-center"
            key={integration.name}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border">
              <Link2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{integration.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{integration.purpose}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-800">
              <CircleAlert aria-hidden="true" className="size-4" />
              Not connected
            </span>
            <Button disabled variant="outline">
              Account required
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
        External account ownership and credential creation require an authorized human. Secrets will
        be written directly to the configured secrets manager and will remain unreadable in this UI.
      </p>
    </ModulePage>
  );
}
