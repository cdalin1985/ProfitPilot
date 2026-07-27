# ADR 0002: Tenant context is mandatory and enforced twice

- Status: Accepted
- Date: 2026-07-27

## Context

Cross-tenant disclosure is the highest-impact platform failure. Relying only on developer-written query filters or only on database policies leaves a single control vulnerable to mistakes.

## Decision

- OIDC identity establishes the user.
- Membership resolution establishes organization, workspace, and role.
- Handlers compare route resources to the authenticated workspace.
- Service APIs require a typed tenant context.
- Database work occurs in a transaction that sets `app.current_organization_id` and `app.current_workspace_id`.
- PostgreSQL row-level security rejects rows outside that context.
- Storage keys, queue messages, traces, metrics, and audit records include tenant identifiers.
- Tests attempt direct-object-reference and cross-tenant access for every resource family.

## Consequences

- Tenant context is never inferred from request bodies.
- Support access uses a separate privileged workflow and cannot reuse normal tenant sessions.
- Database administration and migration roles remain separate from application roles.
