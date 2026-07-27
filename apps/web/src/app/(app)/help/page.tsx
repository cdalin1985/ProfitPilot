import { BookOpenText, LifeBuoy, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { ModulePage } from "@/components/module-page";

export const metadata: Metadata = { title: "Help & support" };

export default function HelpPage(): React.ReactNode {
  const topics = [
    {
      icon: BookOpenText,
      title: "Product specification",
      description: "Functional requirements, workflows, service objectives, and delivery gates.",
    },
    {
      icon: ShieldCheck,
      title: "Security and privacy",
      description: "Tenant isolation, secrets, incident response, and data-governance controls.",
    },
    {
      icon: LifeBuoy,
      title: "Operational runbooks",
      description: "Environment promotion, recovery, connector outages, and support access.",
    },
  ] as const;

  return (
    <ModulePage
      description="Use the project documentation while customer support systems and production ownership are established."
      title="Help & support"
    >
      <div className="max-w-4xl divide-y border-y">
        {topics.map((topic) => {
          const Icon = topic.icon;
          return (
            <section className="flex gap-4 px-3 py-5" key={topic.title}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{topic.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{topic.description}</p>
              </div>
            </section>
          );
        })}
      </div>
    </ModulePage>
  );
}
