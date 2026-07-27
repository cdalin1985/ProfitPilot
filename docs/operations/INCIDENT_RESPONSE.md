# Incident response

## Severity

- **SEV-1:** confirmed or likely cross-tenant exposure, active compromise, unauthorized publication, widespread outage, irreversible attribution/billing corruption, or lost credentials with production access.
- **SEV-2:** major tenant impact, sustained service-objective breach, publication/ingestion failure without safe fallback, or security control degradation.
- **SEV-3:** limited degradation with a safe workaround and no confidentiality or integrity impact.

## First actions

1. Assign incident commander, operations lead, communications lead, and scribe.
2. Open a restricted incident record and start a UTC timeline.
3. Preserve logs, audit events, image digests, configuration revisions, and provider request identifiers.
4. Contain the smallest safe surface: revoke credentials, disable a connector, stop publication, isolate a tenant, or roll back the release.
5. Do not delete evidence or make unrecorded production changes.
6. Notify privacy, legal, security, provider, and customer owners according to severity and contractual requirements.

## Tenant or credential event

- Stop affected reads/writes and rotate the exposed credential.
- Identify organization, workspace, resource families, time window, actors, and downstream destinations.
- Query immutable audit events and provider logs from a restricted analysis role.
- Verify whether data was accessed, altered, exported, or published; do not infer absence from application logs alone.
- Preserve notification deadlines and obtain legal/privacy review.

## Recovery

Restore service progressively after the exploit path or failure mode is understood, mitigated, and independently verified. Reconcile external side effects before retrying jobs. Maintain enhanced monitoring through the defined recovery window.

## Follow-up

Publish an internal review with contributing factors, detection gaps, containment, customer impact, corrective owners, deadlines, and evidence of completion. Avoid blame; require system-level prevention and a regression test for the failure class.
