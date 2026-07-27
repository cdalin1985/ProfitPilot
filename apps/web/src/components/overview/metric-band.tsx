import type { Overview } from "@profit-pilot/contracts";

interface MetricBandProps {
  metrics: Overview["metrics"];
}

export function MetricBand({ metrics }: MetricBandProps): React.ReactNode {
  const commission = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: metrics.commissionCurrency,
    maximumFractionDigits: 0,
  }).format(metrics.commissionAmount);

  const metricItems = [
    { label: "Qualified clicks", value: metrics.qualifiedClicks.toLocaleString("en-US") },
    { label: "Commission", value: commission },
    { label: "Content awaiting review", value: metrics.contentAwaitingReview.toString() },
    {
      label: "Publishing health",
      value: `${metrics.publishingHealthPercent.toFixed(1)}%`,
      healthy: true,
    },
  ] as const;

  return (
    <section aria-label="Performance summary" className="border-y bg-background">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {metricItems.map((metric, index) => (
          <div
            className={`min-w-0 px-5 py-6 sm:px-8 ${
              index % 2 !== 0 ? "border-l" : ""
            } ${index > 1 ? "border-t lg:border-t-0" : ""} ${index > 0 ? "lg:border-l" : ""}`}
            key={metric.label}
          >
            <dt className="text-sm leading-5 text-muted-foreground">{metric.label}</dt>
            <dd
              className={`metric-number mt-1.5 text-[34px] font-semibold leading-none sm:text-[40px] ${
                "healthy" in metric ? "text-healthy" : "text-foreground"
              }`}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
