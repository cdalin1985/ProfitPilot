"use client";

import { AlertCircle, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SelectOption } from "@/lib/onboarding-options";

import { createOrganizationAction, type OnboardingFormState } from "./actions";

interface OnboardingFormProps {
  idempotencyKey: string;
  countries: SelectOption[];
  currencies: SelectOption[];
  timezones: SelectOption[];
  languages: readonly SelectOption[];
}

const initialState: OnboardingFormState = {
  status: "idle",
  submission: 0,
};

function SubmitButton(): React.ReactNode {
  const { pending } = useFormStatus();
  return (
    <Button className="h-11 w-full px-5 sm:w-auto" disabled={pending} type="submit">
      {pending ? "Creating secure workspace…" : "Create workspace"}
      {!pending && <ArrowRight aria-hidden="true" />}
    </Button>
  );
}

function FieldError({ errors, id }: { errors?: string[]; id: string }): React.ReactNode {
  if (!errors?.length) {
    return null;
  }
  return (
    <p className="text-sm text-destructive" id={id}>
      {errors.join(" ")}
    </p>
  );
}

const selectClassName =
  "focus-outline h-10 w-full rounded-lg border border-input bg-background px-3 text-sm aria-invalid:border-destructive";

export function OnboardingForm({
  idempotencyKey,
  countries,
  currencies,
  timezones,
  languages,
}: OnboardingFormProps): React.ReactNode {
  const [state, action] = useActionState(createOrganizationAction, initialState);
  const values = state.values;

  return (
    <form action={action} className="space-y-8" key={state.submission} noValidate>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      {state.status === "error" && (
        <Alert className="p-4" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Workspace setup needs attention</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold tracking-tight">Organization</legend>
        <p className="text-sm leading-6 text-muted-foreground">
          This is the legal and billing account that owns your workspaces.
        </p>
        <div className="space-y-2">
          <Label htmlFor="organizationName">Organization name</Label>
          <Input
            aria-describedby="organizationName-help organizationName-error"
            aria-invalid={Boolean(state.errors?.organizationName)}
            autoComplete="organization"
            defaultValue={values?.organizationName}
            id="organizationName"
            maxLength={120}
            name="organizationName"
            required
          />
          <p className="text-sm text-muted-foreground" id="organizationName-help">
            Use the business or team name that should appear on billing and audit records.
          </p>
          <FieldError errors={state.errors?.organizationName} id="organizationName-error" />
        </div>
      </fieldset>

      <div className="h-px bg-border" />

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold tracking-tight">First workspace</legend>
        <p className="text-sm leading-6 text-muted-foreground">
          A workspace is a strict operating boundary for markets, content, integrations, approvals,
          and reporting.
        </p>

        <div className="space-y-2">
          <Label htmlFor="workspaceName">Workspace name</Label>
          <Input
            aria-describedby="workspaceName-help workspaceName-error"
            aria-invalid={Boolean(state.errors?.["workspace.name"])}
            defaultValue={values?.workspaceName}
            id="workspaceName"
            maxLength={120}
            name="workspace.name"
            required
          />
          <p className="text-sm text-muted-foreground" id="workspaceName-help">
            A clear operating label such as “US Editorial” or “UK Home &amp; Garden.”
          </p>
          <FieldError errors={state.errors?.["workspace.name"]} id="workspaceName-error" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="targetCountry">Primary market</Label>
            <select
              aria-describedby="targetCountry-error"
              aria-invalid={Boolean(state.errors?.["workspace.targetCountry"])}
              className={selectClassName}
              defaultValue={values?.targetCountry ?? "US"}
              id="targetCountry"
              name="workspace.targetCountry"
              required
            >
              {countries.map((country) => (
                <option key={country.value} value={country.value}>
                  {country.label}
                </option>
              ))}
            </select>
            <FieldError
              errors={state.errors?.["workspace.targetCountry"]}
              id="targetCountry-error"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultLanguage">Content language</Label>
            <select
              aria-describedby="defaultLanguage-error"
              aria-invalid={Boolean(state.errors?.["workspace.defaultLanguage"])}
              className={selectClassName}
              defaultValue={values?.defaultLanguage ?? "en"}
              id="defaultLanguage"
              name="workspace.defaultLanguage"
              required
            >
              {languages.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
            <FieldError
              errors={state.errors?.["workspace.defaultLanguage"]}
              id="defaultLanguage-error"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="locale">Formatting locale</Label>
            <Input
              aria-describedby="locale-help locale-error"
              aria-invalid={Boolean(state.errors?.["workspace.locale"])}
              defaultValue={values?.locale ?? "en-US"}
              id="locale"
              maxLength={35}
              name="workspace.locale"
              required
            />
            <p className="text-sm text-muted-foreground" id="locale-help">
              BCP 47 format controls dates, numbers, and editorial conventions.
            </p>
            <FieldError errors={state.errors?.["workspace.locale"]} id="locale-error" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Reporting currency</Label>
            <select
              aria-describedby="currency-error"
              aria-invalid={Boolean(state.errors?.["workspace.currency"])}
              className={selectClassName}
              defaultValue={values?.currency ?? "USD"}
              id="currency"
              name="workspace.currency"
              required
            >
              {currencies.map((currency) => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </select>
            <FieldError errors={state.errors?.["workspace.currency"]} id="currency-error" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="timezone">Operating timezone</Label>
            <select
              aria-describedby="timezone-help timezone-error"
              aria-invalid={Boolean(state.errors?.["workspace.timezone"])}
              className={selectClassName}
              defaultValue={values?.timezone ?? "America/Denver"}
              id="timezone"
              name="workspace.timezone"
              required
            >
              {timezones.map((timezone) => (
                <option key={timezone.value} value={timezone.value}>
                  {timezone.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground" id="timezone-help">
              Used for reporting windows, review deadlines, and scheduled publishing.
            </p>
            <FieldError errors={state.errors?.["workspace.timezone"]} id="timezone-error" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="niche">Primary niche</Label>
            <Input
              aria-describedby="niche-help niche-error"
              aria-invalid={Boolean(state.errors?.["workspace.niche"])}
              defaultValue={values?.niche}
              id="niche"
              list="niche-suggestions"
              maxLength={80}
              name="workspace.niche"
              required
            />
            <datalist id="niche-suggestions">
              <option value="Consumer technology" />
              <option value="Home and garden" />
              <option value="Health and fitness" />
              <option value="Travel" />
              <option value="Personal finance" />
              <option value="Beauty and personal care" />
              <option value="Outdoor recreation" />
            </datalist>
            <p className="text-sm text-muted-foreground" id="niche-help">
              This seeds relevance and policy defaults; it can be refined later.
            </p>
            <FieldError errors={state.errors?.["workspace.niche"]} id="niche-error" />
          </div>
        </div>
      </fieldset>

      <Alert className="gap-x-3 p-4">
        <ShieldCheck aria-hidden="true" className="text-healthy" />
        <AlertTitle>No external actions happen yet</AlertTitle>
        <AlertDescription>
          This creates the secure tenant boundary and audit trail. You will review and test every
          publishing and affiliate connection before activation.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Check aria-hidden="true" className="mt-0.5 size-4 text-healthy" />
          Next: connect and verify a draft-only publishing destination.
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
