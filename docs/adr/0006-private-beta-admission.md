# ADR 0006: Private-beta admission and authoritative activation

- Status: Accepted
- Date: 2026-08-13

## Decision

Production organization onboarding requires an accepted, unrevoked private-beta invitation. Invitations are bound to a verified identity email. The API returns the opaque invitation token only when an operator creates or rotates an invitation; PostgreSQL stores only its SHA-256 digest. Acceptance is atomic, single-use, expiry checked, and permanently binds the invitation to the accepting external identity.

Onboarding progress is reconciled from authoritative workspace resources instead of trusting client-submitted completion flags. Activation requires a persisted readiness snapshot covering workspace profile, publishing destination, affiliate connection, product ingestion, evidence-backed content, a created draft, and brand-policy review. An operator approval re-runs reconciliation in the same activation flow and records the decision and audit event.

Both invitation and activation-request tables force row-level security. Tenant actors can access only their own activation requests; invitation access is restricted to the verified invitee or the operator context. Operator routes require a dedicated secret and operator identifier and must not log invitation tokens or secrets.

PP-112 depends on billing eligibility without owning PP-111 internals. The API therefore accepts an injected `EntitlementFeatureGate`; operator activation invokes that gate before changing workspace state. Deployments can wire the PP-111 entitlement implementation without coupling this package to its persistence model.

## Consequences

- Operators must distribute raw invitation tokens through an approved secure channel immediately after issuance or rotation; the token cannot be recovered later.
- Rotation invalidates the prior token and preserves an auditable version history on the invitation record.
- UI progress may lag until reconciliation runs, but it cannot manufacture activation readiness.
- Production configuration fails closed when the operator key or database is unavailable.
