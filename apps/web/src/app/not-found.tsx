import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFoundPage(): React.ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-lg text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-lg border">
          <FileQuestion aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The requested resource does not exist in this workspace or is no longer available.
        </p>
        <Button asChild className="mt-5">
          <Link href="/overview">Return to overview</Link>
        </Button>
      </div>
    </main>
  );
}
