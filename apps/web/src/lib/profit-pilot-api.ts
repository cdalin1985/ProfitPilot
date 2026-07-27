import "server-only";

import {
  createOrganizationWorkspaceResponseSchema,
  problemDetailsSchema,
  sessionStateSchema,
  type CreateOrganizationWorkspace,
  type CreateOrganizationWorkspaceResponse,
  type ProblemDetails,
  type SessionState,
} from "@profit-pilot/contracts";
import { developmentSession } from "@profit-pilot/fixtures";

import type { WebAuth } from "./auth";
import { getWebAuthMode } from "./auth-mode";

function apiBaseUrl(): string {
  const value = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error("API_BASE_URL is required");
  }
  return new URL(value).toString().replace(/\/$/, "");
}

export class ProfitPilotApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title);
    this.name = "ProfitPilotApiError";
  }
}

async function apiRequest(path: string, auth: WebAuth, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) {
    headers.set("content-type", "application/json");
  }
  if (auth.accessToken) {
    headers.set("authorization", `Bearer ${auth.accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = problemDetailsSchema.safeParse(body);
    throw new ProfitPilotApiError(
      response.status,
      parsed.success
        ? parsed.data
        : {
            type: "https://profitpilot.app/problems/upstream-response",
            title: "Profit Pilot API request failed",
            status: response.status,
          },
    );
  }
  return response;
}

export async function getApplicationSession(
  auth: WebAuth,
  workspaceId?: string,
): Promise<SessionState> {
  if (getWebAuthMode() === "development") {
    if (workspaceId && workspaceId !== developmentSession.tenant.workspaceId) {
      throw new ProfitPilotApiError(403, {
        type: "https://profitpilot.app/problems/tenant-access-denied",
        title: "Tenant access denied",
        status: 403,
      });
    }
    return sessionStateSchema.parse(developmentSession);
  }

  const headers = new Headers();
  if (workspaceId) {
    headers.set("x-workspace-id", workspaceId);
  }
  const response = await apiRequest("/v1/session", auth, { headers });
  return sessionStateSchema.parse(await response.json());
}

export async function createOrganizationWorkspace(
  auth: WebAuth,
  input: CreateOrganizationWorkspace,
  idempotencyKey: string,
): Promise<CreateOrganizationWorkspaceResponse> {
  const response = await apiRequest("/v1/onboarding/organization-workspace", auth, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return createOrganizationWorkspaceResponseSchema.parse(await response.json());
}
