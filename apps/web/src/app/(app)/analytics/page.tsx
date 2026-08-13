import type { Metadata } from "next";

import { MetricBand } from "@/components/overview/metric-band";
import { ModulePage } from "@/components/module-page";
import { getActiveOverview } from "@/lib/overview-context";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage(): Promise<React.ReactNode> {
  const { overview, session } = await getActiveOverview();

  return (
    <ModulePage
      description="Understand qualified clicks, network-reported commission, content cohorts, and publication health."
      title="Analytics"
    >
      <div className="-mx-5 sm:-mx-8">
        <MetricBand metrics={overview.metrics} />
      </div>
      <div className="mt-8 grid gap-6 border-y py-6 lg:grid-cols-3">
        <div>
          <h2 className="text-sm font-semibold">Attribution source</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Qualified first-party click events. Commission remains unavailable until a verified
            network transaction source is connected.
          </p>
        </div>
        <div className="lg:border-l lg:pl-6">
          <h2 className="text-sm font-semibold">Reporting timezone</h2>
          <p className="mt-2 font-mono text-sm">{session.active.workspace.timezone}</p>
        </div>
        <div className="lg:border-l lg:pl-6">
          <h2 className="text-sm font-semibold">Currency</h2>
          <p className="mt-2 font-mono text-sm">
            {session.active.workspace.currency} · original amounts retained
          </p>
        </div>
      </div>
    </ModulePage>
  );
}
