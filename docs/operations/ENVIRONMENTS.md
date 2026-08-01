# Environment and account requirements

## Account topology

Use one AWS Organization with separate accounts:

- Security and log archive.
- Shared services.
- Development.
- Staging.
- Production.

The production account does not share databases, queues, encryption keys, secrets, or application roles with development or staging.

## Primary region

`us-east-1` is the initial primary region. Backups are copied to a second U.S. region after the production data-classification review.

## External systems

The following account work requires an authorized human owner:

- AWS Organization and billing.
- DNS registrar and production domain.
- WorkOS organization.
- Stripe account and bank/tax verification.
- OpenAI production project and spend controls.
- Awin publisher approval and API token.
- WordPress destination and application password.
- Monitoring, paging, support, and transactional-email accounts.

No raw credential should be sent through chat, issue comments, CI configuration, or source control.

## WorkOS AuthKit configuration

Create separate WorkOS environments for development/staging and production. In each environment:

1. Register the exact callback URI (`/auth/callback`), sign-in endpoint (`/sign-in`), and approved logout URI. Do not use wildcard production redirects.
2. Require email verification and enable the approved MFA policy before any owner or administrator is invited to production.
3. Keep the built-in or configured organization owner role slug aligned with `WORKOS_OWNER_ROLE_SLUG`.
4. Store `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, and the audit IP HMAC key only in the environment secret manager.
5. Set the cookie password to a randomly generated value of at least 32 characters. Do not share a cookie domain across unrelated applications.
6. Configure the WorkOS JWT template to emit `{"aud":"urn:profit-pilot:control-plane"}`. Configure the API with that exact audience, the WorkOS issuer, and the application-specific JWKS URL for the same environment as the web application. WorkOS AuthKit access tokens do not include `aud` unless it is added through the JWT template.

Required application configuration:

- Shared: `NODE_ENV=production`, `AUTH_MODE=oidc`.
- Web: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, `API_BASE_URL`.
- API: `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `WORKOS_API_KEY`, `WORKOS_OWNER_ROLE_SLUG`, `AUDIT_IP_HASH_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`.

`NEXT_PUBLIC_WORKOS_REDIRECT_URI` is intentionally public. API keys, cookie passwords, database credentials, and HMAC keys must never use a `NEXT_PUBLIC_` name.

## Promotion

1. Pull request checks.
2. Ephemeral or development validation.
3. Staging deployment and database migration check.
4. Automated smoke, tenant-isolation, and connector contract tests.
5. Production approval for database, IAM, networking, or customer-visible behavior.
6. Progressive deployment with automatic rollback thresholds.

Database migrations must be backward compatible with the currently deployed application. Destructive cleanup occurs only in a later release after usage verification.

PP-101 migration `0004_salty_mandrill.sql` is a pre-GA initialization exception: it stops rather than inventing identity mappings when tenant rows already exist. Do not bypass this check. Prepare and rehearse a separate backfill migration for any non-empty environment.
