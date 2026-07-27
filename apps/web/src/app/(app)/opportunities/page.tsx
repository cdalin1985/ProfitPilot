import type { Metadata } from "next";

import { ModulePage } from "@/components/module-page";
import { OpportunityTable } from "@/components/overview/opportunity-table";
import { getOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage(): Promise<React.ReactNode> {
  const overview = await getOverview();

  return (
    <ModulePage
      description="Rank normalized products using commission, demand, freshness, fit, and evidence quality."
      title="Opportunities"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {overview.opportunities.length} current opportunities
        </p>
        <p className="font-mono text-xs text-muted-foreground">Scoring model opportunity-v1</p>
      </div>
      <OpportunityTable opportunities={overview.opportunities} />
    </ModulePage>
  );
}
