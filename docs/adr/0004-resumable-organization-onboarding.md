# ADR 0004: Organization onboarding is a resumable identity saga

- Status: Accepted
- Date: 2026-07-27

## Context

Creating the first organization crosses two independently available systems: WorkOS and PostgreSQL. A timeout can occur after a WorkOS organization or membership exists but before the local transaction commits. Retrying a naive request could create duplicate identity resources, organizations, or workspaces.

The first workspace also establishes regional settings and the tenant boundary used by every later connector, content, publication, billing, and reporting operation.

## Decision

- The client supplies a UUID idempotency key, and the API binds it to the authenticated external user and a SHA-256 request fingerprint.
- PostgreSQL reserves stable organization and workspace UUIDs before any external side effect.
- The local organization UUID is the WorkOS organization external ID. Retries reconcile by this identifier instead of creating an untraceable duplicate.
- WorkOS user email verification is checked through the management API before provisioning.
- WorkOS organization and organization membership IDs are recorded on the reservation before the local tenant transaction commits.
- Local completion locks the reservation row and rechecks its status, so concurrent identical requests serialize into one commit and one replay.
- The local organization, workspace, owner membership, workspace administrator membership, onboarding ledger, and audit events commit atomically.
- Failures retain the reservation and a non-sensitive error code. Retrying the same request resumes; reusing the key for different input returns a conflict.
- A completed retry reads local state and does not depend on WorkOS availability.
- The initial workspace profile completes step one of a nine-step ledger. Publishing destination setup is next, and no connector or publication side effect is performed by PP-101.

## Tenant and session controls

- WorkOS organization context is refreshed after successful creation.
- The active local workspace is held in an HttpOnly, `SameSite=Lax`, secure-in-production cookie.
- The cookie is a preference, not authority. The API resolves and revalidates tenant membership for every request.
- Organization and workspace selection lists come from actor-scoped database functions. Suspended or archived resources cannot become active tenant contexts.
- Pre-tenant onboarding reservations use actor-scoped forced row-level security.

## Migration constraint

Migration `0004_salty_mandrill.sql` is an initialization migration for the greenfield, pre-GA database. It intentionally stops when legacy organizations, workspaces, or memberships exist because those rows lack real WorkOS identifiers and required workspace profile data. An environment with tenant data must first run a reviewed identity-linking and profile-backfill migration; fabricated external IDs and silent defaults are prohibited.

## Consequences

- A transient WorkOS or database failure is recoverable without duplicate customer resources.
- The system can show precise onboarding progress and safely add later steps.
- WorkOS and PostgreSQL drift can be reconciled using stable external identifiers.
- Deployment automation must treat a PP-101 migration preflight failure as a stop condition, not an invitation to delete data.
