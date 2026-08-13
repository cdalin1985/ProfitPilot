import type { Metadata } from "next";

import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { getActiveOverview } from "@/lib/overview-context";

export const metadata: Metadata = {
  title: "Overview",
};

export const dynamic = "force-dynamic";

export default async function OverviewPage(): Promise<React.ReactNode> {
  const { overview } = await getActiveOverview();
  return <OverviewDashboard overview={overview} />;
}
