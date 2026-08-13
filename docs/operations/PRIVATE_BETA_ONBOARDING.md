# Private-beta onboarding and activation

Use this runbook for the initial 5–10 design partners. Keep the cohort deliberately small and confirm support ownership before adding another organization.

## Required configuration

- Configure `BETA_OPERATOR_KEY` as at least 32 random characters in the API secret store.
- Ensure the API connects with the normal application database role; both beta tables force row-level security.
- Wire the PP-111 entitlement implementation through the API's `EntitlementFeatureGate` before activating a production workspace.
- Never place invitation tokens, operator keys, or full request headers in tickets, logs, analytics, or screenshots.

## Invite and accept

1. An operator client calls `POST /v1/operator/beta/invitations` with `x-beta-operator-key` and the partner's verified email.
2. Deliver the returned one-time token over the approved secure channel. The token is displayed only in this response; only its SHA-256 digest is stored.
3. The partner signs in with that verified email and calls `POST /v1/beta/invitations/accept` with the token.
4. Confirm `GET /v1/beta/admission` reports an accepted admission before creating the organization and workspace.
5. If a pending token may be exposed, call `POST /v1/operator/beta/invitations/:inviteId/rotate` and distribute only the replacement. Rotation invalidates the prior token.

Do not rotate an accepted invitation. Revoke or suspend access through the operator process and identity provider when a partner leaves the cohort.

## Request activation

1. Have the workspace owner finish onboarding resources: profile, active publishing destination, active affiliate connection, product ingestion, evidence-backed content, a WordPress draft, and brand-policy review.
2. Call `POST /v1/workspaces/:workspaceId/activation-requests` with a unique `Idempotency-Key` UUID. The API reconciles actual resources and rejects an incomplete workspace.
3. Review the stored readiness snapshot and the associated audit trail. Resolve every failed check by fixing the source resource; do not edit onboarding flags directly.
4. Confirm billing/entitlement eligibility.
5. An operator client calls `POST /v1/operator/activation-requests/:requestId/activate` with `x-beta-operator-key` and `x-operator-id`.
6. Confirm the activation request is approved, the workspace is active, and the workspace-activation onboarding step is complete.

Operator activation re-runs authoritative reconciliation, so a resource disabled after the request prevents activation. Reusing the same request or idempotency key is safe and does not create a second activation.

## Incident response

- Suspected token exposure: rotate a pending invitation immediately; if already accepted, disable the identity and follow the incident-response runbook.
- Suspected operator-key exposure: rotate `BETA_OPERATOR_KEY`, redeploy the API, and review invitation, activation, and audit records.
- Unexpected activation: suspend the workspace, preserve relevant audit records, and escalate through [incident response](INCIDENT_RESPONSE.md).
