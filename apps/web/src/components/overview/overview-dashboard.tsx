import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { Overview } from "@profit-pilot/contracts";

import { CreateContentButton } from "./create-content-button";
import { MetricBand } from "./metric-band";
import { OpportunityTable } from "./opportunity-table";
import { PipelineBand } from "./pipeline-band";
import { QueueList } from "./queue-list";

interface OverviewDashboardProps {
  overview: Overview;
}

export function OverviewDashboard({ overview }: OverviewDashboardProps): React.ReactNode {
  return (
    <main>
      <section className="px-5 pb-6 pt-7 sm:px-8 sm:pb-6 sm:pt-8">
        <div className="max-w-3xl">
          <h1 className="text-[42px] font-semibold leading-[48px] tracking-[-0.045em]">Overview</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Prioritize the next action across discovery, content, and publishing.
          </p>
          <div className="mt-5">
            <CreateContentButton />
          </div>
        </div>
      </section>
      <MetricBand metrics={overview.metrics} />
      <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
        <section
          className="min-w-0 px-5 py-6 sm:px-8 xl:border-r"
          aria-labelledby="opportunities-title"
        >
          <div className="mb-2 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-[-0.025em]" id="opportunities-title">
              Top opportunities
            </h2>
            <Link
              className="focus-outline inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline"
              href="/opportunities"
            >
              View all opportunities
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <OpportunityTable
            generatedAt={overview.generatedAt}
            opportunities={overview.opportunities.slice(0, 3)}
          />
        </section>
        <section className="min-w-0 border-t py-6 xl:border-t-0" aria-labelledby="queue-title">
          <div className="mb-3 flex items-center justify-between gap-4 px-4">
            <h2 className="text-xl font-semibold tracking-[-0.025em]" id="queue-title">
              Today’s queue
            </h2>
            <Link
              className="focus-outline inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline"
              href="/content"
            >
              View all
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <QueueList generatedAt={overview.generatedAt} items={overview.queue} />
        </section>
      </div>
      <PipelineBand pipeline={overview.pipeline} />
    </main>
  );
}
