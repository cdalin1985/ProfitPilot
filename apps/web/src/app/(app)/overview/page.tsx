import type { Metadata } from "next";

import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { getOverview } from "@/lib/data";

export const metadata: Metadata = {
  title: "Overview",
};

export const dynamic = "force-dynamic";

export default async function OverviewPage(): Promise<React.ReactNode> {
  const overview = await getOverview();
  return <OverviewDashboard overview={overview} />;
}
