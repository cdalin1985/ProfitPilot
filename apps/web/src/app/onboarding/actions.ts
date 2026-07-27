"use server";

import { refreshSession } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { createOrganizationWorkspaceSchema, identifierSchema } from "@profit-pilot/contracts";

import { requireWebAuth } from "@/lib/auth";
import { getWebAuthMode } from "@/lib/auth-mode";
import { createOrganizationWorkspace, ProfitPilotApiError } from "@/lib/profit-pilot-api";
import { setActiveWorkspaceId } from "@/lib/workspace-cookie";

export interface OnboardingFormValues {
  organizationName: string;
  workspaceName: string;
  targetCountry: string;
  defaultLanguage: string;
  locale: string;
  currency: string;
  timezone: string;
  niche: string;
}

export interface OnboardingFormState {
  status: "idle" | "error";
  submission: number;
  message?: string;
  errors?: Record<string, string[]>;
  values?: OnboardingFormValues;
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function valuesFrom(formData: FormData): OnboardingFormValues {
  return {
    organizationName: text(formData, "organizationName"),
    workspaceName: text(formData, "workspace.name"),
    targetCountry: text(formData, "workspace.targetCountry"),
    defaultLanguage: text(formData, "workspace.defaultLanguage"),
    locale: text(formData, "workspace.locale"),
    currency: text(formData, "workspace.currency"),
    timezone: text(formData, "workspace.timezone"),
    niche: text(formData, "workspace.niche"),
  };
}

function validationErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path.join(".");
    errors[field] = [...(errors[field] ?? []), issue.message];
  }
  return errors;
}

export async function createOrganizationAction(
  previousState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const values = valuesFrom(formData);
  const parsed = createOrganizationWorkspaceSchema.safeParse({
    organizationName: values.organizationName,
    workspace: {
      name: values.workspaceName,
      targetCountry: values.targetCountry,
      defaultLanguage: values.defaultLanguage,
      locale: values.locale,
      currency: values.currency,
      timezone: values.timezone,
      niche: values.niche,
    },
  });
  const idempotencyKey = identifierSchema.safeParse(text(formData, "idempotencyKey"));

  if (!parsed.success || !idempotencyKey.success) {
    return {
      status: "error",
      submission: previousState.submission + 1,
      message: "Review the fields below and correct the highlighted items.",
      errors: {
        ...(parsed.success ? {} : validationErrors(parsed.error.issues)),
        ...(idempotencyKey.success
          ? {}
          : {
              request: ["This form expired. Reload the page before trying again."],
            }),
      },
      values,
    };
  }

  try {
    const auth = await requireWebAuth();
    const created = await createOrganizationWorkspace(auth, parsed.data, idempotencyKey.data);

    if (getWebAuthMode() === "oidc") {
      await refreshSession({
        organizationId: created.organization.identityProviderOrganizationId,
        ensureSignedIn: true,
      });
    }
    await setActiveWorkspaceId(created.workspace.id);
  } catch (error) {
    const problem = error instanceof ProfitPilotApiError ? error.problem : undefined;
    return {
      status: "error",
      submission: previousState.submission + 1,
      message:
        problem?.detail ??
        "We could not finish workspace setup. Your progress is safe; try again with the same form.",
      ...(problem?.errors ? { errors: problem.errors } : {}),
      values,
    };
  }

  redirect("/integrations?from=onboarding");
}
