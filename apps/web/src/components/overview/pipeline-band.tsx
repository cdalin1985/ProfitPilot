import { CalendarDays, CircleCheck, FileText, Globe2, UserRoundCheck } from "lucide-react";

import type { Overview } from "@profit-pilot/contracts";

interface PipelineBandProps {
  pipeline: Overview["pipeline"];
}

export function PipelineBand({ pipeline }: PipelineBandProps): React.ReactNode {
  const stages = [
    { label: "Draft", value: pipeline.draft, icon: FileText },
    { label: "In review", value: pipeline.inReview, icon: UserRoundCheck },
    { label: "Approved", value: pipeline.approved, icon: CircleCheck },
    { label: "Scheduled", value: pipeline.scheduled, icon: CalendarDays },
    { label: "Published", value: pipeline.published, icon: Globe2 },
  ] as const;

  return (
    <section aria-labelledby="pipeline-title" className="border-t px-5 py-5 sm:px-8">
      <h2 id="pipeline-title" className="text-xl font-semibold tracking-[-0.025em]">
        Editorial pipeline
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <div
              className={`flex items-center justify-between gap-3 pr-5 ${
                index > 0 ? "lg:border-l lg:pl-6" : ""
              }`}
              key={stage.label}
            >
              <div>
                <dt className="text-sm text-muted-foreground">{stage.label}</dt>
                <dd className="metric-number mt-1 text-3xl font-semibold">{stage.value}</dd>
              </div>
              <span className="hidden size-11 items-center justify-center rounded-lg border sm:flex">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
