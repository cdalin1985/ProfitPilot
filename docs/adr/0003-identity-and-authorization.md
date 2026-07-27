# ADR 0003: OIDC identity with application authorization

- Status: Accepted
- Date: 2026-07-27

## Context

The platform requires SSO compatibility and centralized authentication without coupling domain authorization to one identity vendor.

## Decision

- Production accepts standards-based OIDC JWTs using a configured issuer, audience, and remote JWKS.
- WorkOS AuthKit is the initial managed identity provider and owns authentication, verified email state, MFA policy, sessions, organizations, and external organization memberships.
- Access tokens establish only the external user, current WorkOS organization, and session. Token roles, workspace IDs, permissions, and request-body tenant fields are never application authorization inputs.
- PostgreSQL resolves the WorkOS user and organization to active local organization and workspace memberships on every tenant request.
- Application roles and permissions live in `@profit-pilot/authz`.
- Proxy or middleware may improve navigation but is never the sole authorization gate.
- Development identity is available only outside production and uses a fixed, documented tenant context.

## Consequences

- Switching identity providers does not rewrite the permission model.
- OIDC claims must map to an active local membership before customer data is returned.
- Organization owners and administrators require verified WorkOS email and the production WorkOS MFA policy.
- Production requests fail closed when OIDC, WorkOS administration, encrypted-cookie, audit-HMAC, or database configuration is incomplete.
