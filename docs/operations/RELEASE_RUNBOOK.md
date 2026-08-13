# Release runbook

## Before promotion

1. Confirm the release revision and immutable image digests.
2. Confirm CI, CodeQL, dependency review, contract tests, tenant-isolation tests, migration rehearsal, and browser checks are green.
3. Review configuration and secret references without reading secret values.
4. Review the database migration for compatibility with both current and new application versions.
5. Record the rollout stages, owners, dashboards, alerts, rollback thresholds, and customer communication.
6. Create or confirm the backup/restore point required by the migration risk class.
7. For PP-101, prove tenant tables are empty or attach the approved WorkOS identity-linking and workspace-profile backfill plan. A `0004` preflight failure blocks promotion.
8. Verify the WorkOS callback, sign-in, and logout URIs; email verification; MFA policy; owner-role slug; and environment pairing without exposing secret values.
9. For PP-111, verify the Stripe API version, price allowlist, webhook secret reference, Customer
   Portal policy, signed-event replay checks, and effective-entitlement denials in staging.

## Promotion

1. Apply backward-compatible migrations using the dedicated migration role.
2. Deploy to staging and run smoke and connector reconciliation checks.
3. Deploy production canary tasks with no more than 5% traffic.
4. Observe error rate, p95 latency, saturation, queue age, connector failures, publication reconciliation, authentication failures, and tenant-denial anomalies.
5. Exercise new-user onboarding, same-key replay after an injected failure, organization selection, workspace selection, session refresh, sign-out, and a cross-workspace denial.
6. Increase traffic only while all release thresholds remain healthy.
7. Record the deployment, approver, revision, image digests, migration identifiers, and resulting health.

## Rollback

Roll back application images immediately when a threshold is breached and the failure is not understood within the release window. Do not reverse a data migration unless a tested reverse migration exists and no newer writer depends on the new schema. Prefer rolling the application forward with a compatibility fix.

Disable the affected connector or publication capability with a server-side feature flag when the failure is isolated to an external side effect. Preserve idempotency and reconcile remote state before replay.

## Completion

The release is complete only after canary and full rollout observation windows pass, queued work is healthy, destination reconciliation is current, and the release record contains final metrics and any follow-up work.
