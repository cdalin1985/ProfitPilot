# Execution backlog

## Inception milestone

- PP-001: Establish monorepo, pinned runtime, lockfile, and CI.
- PP-002: Implement application shell from the accepted design concepts.
- PP-003: Define typed API contracts and RFC 9457 error responses.
- PP-004: Implement organization/workspace/user schema and tenant transaction helper.
- PP-005: Implement central roles and permission tests.
- PP-006: Implement OIDC verification boundary with production fail-closed configuration.
- PP-007: Add health endpoints, structured logs, request IDs, rate limits, and log redaction.
- PP-008: Add AWS Terraform foundation and environment account contract.
- PP-009: Add threat model, ADRs, runbooks, and release gates.
- PP-010: Prove lint, type, unit, build, and browser checks in CI.

## First vertical slice

- PP-101: Organization onboarding and workspace creation. Implemented; production activation remains gated on WorkOS environment configuration and staging verification.
- PP-102: Awin OAuth/token connection and read-only connection test.
- PP-103: Awin product-feed ingestion with quota and freshness policy.
- PP-104: Product normalization and opportunity score v1.
- PP-105: Content brief and grounded generation workflow.
- PP-106: Claim/evidence graph and mandatory validation suite.
- PP-107: Editorial review, change request, and approval audit.
- PP-108: WordPress Application Password connection and draft publication.
- PP-109: Signed click redirect and qualified-click event ingestion.
- PP-110: Overview metrics backed by production repositories.
- PP-111: Stripe Checkout, webhook projection, entitlements, and Customer Portal.
- PP-112: Private-beta onboarding for 5–10 design partners.

## General-availability gates

- Cross-tenant access suite passes for every resource family.
- Awin and WordPress contract suites pass against sandbox or dedicated test accounts.
- Load tests meet the specification’s control-plane and redirect targets.
- Backup restore and regional recovery exercises meet RPO and RTO.
- Legal review approves disclosures, terms, privacy notice, tracking, and restricted categories.
- Support, incident, abuse, billing, and privacy-request runbooks are exercised.
