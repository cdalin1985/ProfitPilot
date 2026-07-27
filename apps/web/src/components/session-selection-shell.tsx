import { ProfitPilotMark } from "./profit-pilot-mark";

interface SessionSelectionShellProps {
  eyebrow: string;
  title: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}

export function SessionSelectionShell({
  eyebrow,
  title,
  description,
  error,
  children,
}: SessionSelectionShellProps): React.ReactNode {
  return (
    <main className="min-h-screen bg-muted/55 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <ProfitPilotMark className="text-foreground" />
        <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">{title}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
          {error && (
            <p
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="mt-7 space-y-3">{children}</div>
        </section>
      </div>
    </main>
  );
}
