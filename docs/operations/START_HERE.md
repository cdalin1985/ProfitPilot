# Start here

This is the shortest safe path from the completed greenfield foundation to a private production beta.

## Already completed in this repository

- Pinned Node.js and pnpm monorepo with a reviewed lockfile and production-only dependency audit.
- Responsive Next.js application shell, overview, opportunities, content review, calendar, publications, analytics, integrations, settings, and support routes.
- Fastify API with startup validation, development and OIDC identity boundaries, centralized permissions, tenant checks, request IDs, structured/redacted logs, CORS, rate limits, security headers, RFC 9457 errors, liveness, and dependency-backed readiness.
- Drizzle PostgreSQL schema, generated migrations, data constraints, current-revision integrity, tenant-scoped transactions, forced row-level security, and append-only audit policies.
- Local PostgreSQL and Redis Compose definition.
- AWS Terraform foundation for isolated networking, Aurora PostgreSQL, Redis, KMS, Secrets Manager, S3, ECR, ECS, and CloudWatch.
- Non-root container definitions, pull-request CI, CodeQL, dependency review, Dependabot, threat model, ADRs, and runbooks.
- Production code paths fail closed; development fixtures cannot silently appear in production.

## Human-owned account gates

An authorized owner must create or approve these because they involve identity, contracts, billing, domains, bank/tax details, or production credentials:

1. GitHub organization/repository, protected `main`, required CI checks, private vulnerability reporting, and workload-identity trust.
2. AWS Organization accounts for security/log archive, shared services, development, staging, and production; budgets and IAM Identity Center must be active before provisioning.
3. Production domain, DNS ownership, certificate issuance, and sender-domain authentication.
4. WorkOS organization, production redirect URIs, verified domain, admin-portal policy, and break-glass ownership.
5. Awin publisher approval and API access; CJ/Amazon only after their respective program approval.
6. A dedicated WordPress integration user and Application Password on a non-production test destination first.
7. Stripe legal entity, bank/tax verification, product/price approval, webhook endpoint, and Customer Portal policy.
8. OpenAI production project, data controls, model allowlist, rate limits, and spend alerts.
9. Monitoring/paging, transactional email, support, privacy, legal, and incident-response owners.

Do not paste secrets into chat or source control. Store them directly in the relevant secret manager and share only secret identifiers with deployment configuration.

## Recommended execution order

### 1. Establish source control

- Create the private repository and push this tree.
- Require CI, security analysis, signed commits, two reviewers for infrastructure/security/data changes, and no direct pushes to `main`.
- Add real code owners in repository settings after owners are known.

### 2. Bootstrap non-production AWS

- Create the encrypted/versioned Terraform state bucket in shared services.
- Use workload identity from GitHub Actions; do not create long-lived AWS access keys.
- Run the Terraform root first in `development`, then `staging`.
- Review monthly cost estimates and set environment budgets before apply.
- Keep databases and Redis private; no public endpoint is permitted.

### 3. Implement the first vertical slice

Build PP-101 through PP-110 from [the backlog](../BACKLOG.md) in order. The acceptance path is:

```text
WorkOS sign-in
  -> organization/workspace
  -> Awin connection test
  -> product ingestion
  -> opportunity score
  -> evidence-backed content draft
  -> validation
  -> human approval
  -> WordPress draft
  -> destination reconciliation
  -> production-backed overview
```

Each stage must emit an audit event and preserve tenant context. External side effects require an idempotency key and a reconciliation job.

### 4. Add billing only after entitlements are enforceable

- Use Stripe-hosted Checkout and Customer Portal.
- Treat signed webhooks as the source of truth.
- Project subscriptions into an entitlement table.
- Enforce limits at API and worker boundaries, not only in the UI.

### 5. Prove the system in staging

- Connector contract tests against dedicated accounts.
- Cross-tenant negative tests for every resource family.
- Migration rehearsal from a production-like snapshot.
- Load tests for control-plane API, ingestion, workers, and redirect endpoints.
- Backup restore, secret rotation, connector outage, and rollback exercises.
- Accessibility, browser, mobile, security, privacy, legal, and affiliate-program review.

### 6. Run a controlled private beta

- Begin with 5-10 design partners and manual workspace activation.
- Default publishing to human approval and WordPress draft only.
- Use feature flags and progressive deployment.
- Define rollback thresholds before each release.
- Promote toward general availability only after the specification's service objectives and operational gates are measured, not assumed.

## Release-blocking rules

- No known high or critical runtime vulnerabilities.
- No unverified database migration or rollback path.
- No credentials in repository, CI variables, logs, or Terraform outputs.
- No production fixtures, fabricated evidence, unsupported claims, or silent connector fallback.
- No unapproved cross-tenant query path.
- No external publication without verified destination ownership, current revision, mandatory validation, human approval, and an audit record.
