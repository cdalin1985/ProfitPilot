"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps): React.ReactNode {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5">
      <div className="max-w-lg text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-lg border bg-red-50 text-destructive">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">This view could not be loaded</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The request was not completed. Retry the operation; if it continues, provide the incident
          reference to support.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Incident reference: {error.digest}
          </p>
        )}
        <Button className="mt-5" onClick={unstable_retry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
