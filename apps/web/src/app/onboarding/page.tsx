import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfitPilotMark } from "@/components/profit-pilot-mark";
import { getActiveWorkspaceSession } from "@/lib/active-session";
import { requireWebAuth } from "@/lib/auth";
import { getOnboardingOptions, supportedLanguages } from "@/lib/onboarding-options";
import { routeForIncompleteSession } from "@/lib/session-routing";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Set up your organization",
};

export default async function OnboardingPage(): Promise<React.ReactNode> {
  const auth = await requireWebAuth();
  const session = await getActiveWorkspaceSession(auth);
  const nextRoute = routeForIncompleteSession(session);
  if (nextRoute && nextRoute !== "/onboarding") {
    redirect(nextRoute);
  }
  if (session.status === "active") {
    redirect("/overview");
  }

  const options = getOnboardingOptions();
  return (
    <main className="min-h-screen bg-muted/55 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <ProfitPilotMark className="text-foreground" />
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Secure setup · Step 1 of 9
          </span>
        </div>
        <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-primary">
              Organization &amp; workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Build the operating boundary first
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              These settings control access, regional formatting, evidence policy, scheduling, and
              reporting. They are validated now so downstream integrations inherit consistent
              defaults.
            </p>
          </div>
          <OnboardingForm
            countries={options.countries}
            currencies={options.currencies}
            idempotencyKey={randomUUID()}
            languages={supportedLanguages}
            timezones={options.timezones}
          />
        </section>
      </div>
    </main>
  );
}
