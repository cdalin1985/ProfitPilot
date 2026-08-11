# Profit Pilot

Profit Pilot is a multi-tenant affiliate operations platform for discovering product opportunities, producing grounded editorial content, governing approvals, publishing to authorized destinations, and measuring results.

This repository is the greenfield production foundation. It intentionally fails closed in production when database or OIDC configuration is absent. Development fixtures are permitted only in `development` and `test`; production routes never silently fall back to seed data.

## Repository map

```text
apps/
  api/             Fastify control-plane API
  web/             Next.js App Router application
packages/
  authz/           Central role and permission policy
  contracts/       Zod request, response, and domain contracts
  db/              Drizzle schema and tenant-scoped database access
docs/
  adr/             Architectural decision records
  design/          Accepted visual specifications and design system
  operations/      Runbooks and environment requirements
  security/        Threat model and security controls
infra/
  terraform/       AWS infrastructure as code
```

## Local prerequisites

- Node.js 24
- pnpm 11
- Windows PowerShell 5.1 or newer for the recommended native PostgreSQL workflow
- Docker Desktop or another Compose-compatible runtime only when exercising the future Redis dependency locally

## Local startup

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm db:local:start
pnpm dev
```

The web application listens on `http://localhost:3000`; the API listens on `http://127.0.0.1:4000`.

`pnpm db:local:start` downloads the pinned EDB PostgreSQL 17 binary archive into the ignored `.data` directory, verifies its SHA-256 checksum, rejects unsafe archive paths, initializes a password-authenticated cluster bound to `127.0.0.1`, creates the same local roles as Compose, and applies migrations. Stop it with `pnpm db:local:stop`. Docker Compose remains available as an optional production-parity path when Redis enters an active vertical slice.

Local authentication is a deliberate development mode with one fixed tenant context. `NODE_ENV=production` rejects `AUTH_MODE=development`.

The root `dev` command loads the ignored root `.env` with Node's native environment-file support and Turbo passes only the documented variables to each service. To exercise the real WorkOS staging boundary locally, follow [WorkOS staging activation](docs/operations/WORKOS_STAGING.md); do not paste credentials into chat or commit `.env`.

For the exact ownership handoff and account-dependent sequence, use [Start here](docs/operations/START_HERE.md).

## Verification

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Production configuration

Production configuration is supplied through the deployment platform and AWS Secrets Manager. Required values are validated during application startup:

- `NODE_ENV=production`
- `AUTH_MODE=oidc`
- `AUTH_JWKS_URL`
- `AUTH_ISSUER`
- `AUTH_AUDIENCE` (`urn:profit-pilot:control-plane`; emitted by the WorkOS JWT template)
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD` (at least 32 random characters)
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- `WORKOS_OWNER_ROLE_SLUG`
- `AUDIT_IP_HASH_KEY` (at least 32 random characters)
- `DATABASE_URL`
- `ALLOWED_ORIGINS`

Provider credentials are referenced by secret ARN or secret identifier. They are never stored in this repository, Terraform state outputs, application logs, or browser-accessible environment variables.

## Current delivery boundary

The inception milestone is implemented: application shell and review workflows, typed contracts, Fastify security boundary, centralized authorization, PostgreSQL schema and migrations, tenant row-level security, local dependencies, AWS infrastructure foundation, container definitions, CI, dependency scanning, and operational/security documentation.

PP-101 organization onboarding is implemented with WorkOS AuthKit, verified-user provisioning, resumable idempotency, local organization/workspace roles, actor- and tenant-scoped row-level security, session refresh, and organization/workspace selection. Production activation still requires the human-owned WorkOS environment and staging checks.

Production overview/content repositories, affiliate ingestion, grounded generation, WordPress publication, click attribution, billing, and external observability remain later vertical-slice work. Production routes fail closed instead of substituting fixtures while those systems are unconfigured.

## Delivery rules

- Every request and background job carries organization and workspace context.
- Authorization occurs at the handler or service boundary; routing middleware is not an authorization boundary.
- Database access runs in a tenant-scoped transaction and PostgreSQL row-level security provides defense in depth.
- All mutations use idempotency keys when retried or invoked by an external system.
- Affiliate content cannot be approved with failed factuality, disclosure, prohibited-claim, duplicate, or link-policy checks.
- Publishing remains a human-approved action until a workspace explicitly satisfies the configured automation policy.

See the [production specification](../Profit_Pilot_Production_Specification.md) for the complete product and platform requirements.
