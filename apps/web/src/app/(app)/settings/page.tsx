import type { Metadata } from "next";

import { ModulePage } from "@/components/module-page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage(): React.ReactNode {
  return (
    <ModulePage
      description="Workspace defaults are explicit so generation, scheduling, reporting, and compliance remain deterministic."
      title="Settings"
    >
      <dl className="max-w-3xl divide-y border-y">
        {[
          ["Organization", "Northstar Media"],
          ["Workspace", "US Editorial"],
          ["Locale", "en-US"],
          ["Currency", "USD"],
          ["Timezone", "America/Denver"],
          ["Approval policy", "Human approval required"],
          ["Environment", "Development identity and fixture data"],
        ].map(([label, value]) => (
          <div className="grid grid-cols-[180px_1fr] gap-6 px-3 py-4 text-sm" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </ModulePage>
  );
}
