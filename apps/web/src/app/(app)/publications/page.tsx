import { Globe2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { ModulePage } from "@/components/module-page";

export const metadata: Metadata = { title: "Publications" };

export default function PublicationsPage(): React.ReactNode {
  return (
    <ModulePage
      description="Verify destination drafts, remote edits, schedules, publication results, and canonical URLs."
      title="Publications"
    >
      <EmptyState
        actionHref="/integrations"
        actionLabel="Configure WordPress"
        description="This development workspace has no authenticated WordPress destination. Publication remains unavailable until a destination passes a read-only connection test."
        icon={Globe2}
        title="No publishing destination connected"
      />
    </ModulePage>
  );
}
