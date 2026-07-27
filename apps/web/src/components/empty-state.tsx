import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  actionHref: string;
  actionLabel: string;
  description: string;
  icon: LucideIcon;
  title: string;
}

export function EmptyState({
  actionHref,
  actionLabel,
  description,
  icon: Icon,
  title,
}: EmptyStateProps): React.ReactNode {
  return (
    <section className="flex min-h-80 flex-col items-center justify-center border-y py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg border bg-muted/45">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild className="mt-5">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </section>
  );
}
