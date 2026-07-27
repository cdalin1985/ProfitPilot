# ADR 0003: OIDC identity with application authorization

- Status: Accepted
- Date: 2026-07-27

## Context

The platform requires SSO compatibility and centralized authentication without coupling domain authorization to one identity vendor.

## Decision

- Production accepts standards-based OIDC JWTs using a configured issuer, audience, and remote JWKS.
- WorkOS is the initial managed identity provider, but domain code depends only on verified claims.
- Application roles and permissions live in `@profit-pilot/authz`.
- Proxy or middleware may improve navigation but is never the sole authorization gate.
- Development identity is available only outside production and uses a fixed, documented tenant context.

## Consequences

- Switching identity providers does not rewrite the permission model.
- OIDC claims must map to an active local membership before customer data is returned.
- Production startup fails when OIDC configuration is incomplete.
