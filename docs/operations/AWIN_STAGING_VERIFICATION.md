# Awin staging verification

Use this runbook after the stacked Awin changes are present in order: PR #22, then #23. PRs
#24 and #25 may also be deployed; their later migrations do not change the Awin contract.

The release gate proves four things without printing an Awin token:

1. The active tenant connection references the intended AWS Secrets Manager secret.
2. The staging application role is non-superuser, cannot bypass RLS, and sees the connection only
   in its declared organization and workspace.
3. The real Awin Enhanced Feed still satisfies the production JSONL reader, final-line error check,
   size limits, normalizer, rejection threshold, and score version.
4. The deployed connection-test route works, and the feed import route works when the explicit
   mutation flag is enabled.

## Required access

- Run from an approved operator shell or one-off task with network access to staging PostgreSQL and
  `https://api.awin.com`.
- Use a migration/admin database URL only for schema inspection and migration execution.
- Use the exact non-superuser application `DATABASE_URL` for RLS assertions.
- Assume an AWS role with `secretsmanager:GetSecretValue` limited to the one Awin secret.
- Obtain a short-lived staging user access token with `connections:manage`. Do not paste it into a
  ticket, chat, command argument, or shell history.
- Select a joined advertiser with a non-empty Enhanced/Google retail feed for the target locale.

## 1. Record the candidate

Record the commit SHA, API image digest, database snapshot/restore point, operator, UTC start time,
and the expected organization, workspace, connection, publisher, advertiser, and locale. Stop if
PR #23 is not based on the exact merged head of PR #22.

Confirm both `Continuous integration` and `Security analysis` run on every PR in the stack. A stacked
PR is not green if Semgrep or dependency audit is absent, even when all four CI jobs pass.

```powershell
git rev-parse HEAD
git log --oneline --decorate -5
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 2. Configure the operator shell

Set values directly in the approved shell. `DATABASE_ADMIN_URL`, `DATABASE_URL`,
`AWIN_STAGING_AUTH_TOKEN`, and the resolved Awin token are credentials; never echo them.

```powershell
$env:DATABASE_ADMIN_URL = '<staging migration-role URL>'
$env:DATABASE_URL = '<staging application-role URL>'
$env:AWS_REGION = 'us-east-1'
$env:AWIN_SECRET_REFERENCE = '<secret ARN or name>'
$env:AWIN_ORGANIZATION_ID = '<organization UUID>'
$env:AWIN_WORKSPACE_ID = '<workspace UUID>'
$env:AWIN_CONNECTION_ID = '<affiliate_connections UUID>'
$env:AWIN_PUBLISHER_ID = '<positive integer>'
$env:AWIN_ADVERTISER_ID = '<positive integer>'
$env:AWIN_FEED_LOCALE = 'en_US'
$env:AWIN_COMMISSION_RATE = '<optional 0-100 value>'
$env:AWIN_STAGING_API_BASE_URL = 'https://api.staging.profitpilot.app'
$env:AWIN_STAGING_AUTH_TOKEN = '<short-lived OIDC access token>'
```

The secret value may be either the raw Awin access token or JSON shaped as
`{"accessToken":"..."}`. The connection row must store only `AWIN_SECRET_REFERENCE`, never the
token.

## 3. Rehearse and inspect migrations

Run the migration command against a production-like staging snapshot before application rollout.
It must complete through `0005_fresh_turbo.sql`; deployments containing PRs #24 and #25 must also
complete `0006` and `0007`.

```powershell
pnpm --filter @profit-pilot/db db:migrate
pnpm --filter @profit-pilot/db verify:staging:awin
```

The verifier fails unless:

- the Drizzle journal contains at least migrations `0000` through `0005`;
- `affiliate_connections`, `feed_sync_states`, `products`, `opportunities`, and `audit_events`
  have enabled and forced RLS with their expected policies;
- feed identity, product identity, and score-history unique indexes exist;
- `DATABASE_URL` uses neither `SUPERUSER` nor `BYPASSRLS`;
- the active Awin row matches the organization, workspace, connection, and secret reference;
- the same connection is invisible under a random mismatched tenant context.

If the connection row has not been provisioned, create it through an approved admin procedure only
after verifying the token. Set `provider = 'awin'`, `status = 'active'`, the exact secret reference,
the reviewed policy version, and `last_verified_at`. Do not use the application role or place the raw
token in SQL.

## 4. Run the real contract and deployed connection test

Leave `AWIN_RUN_STAGING_IMPORT` unset for the first pass. This reads the secret, calls
`GET /publishers`, downloads the real Enhanced Feed, checks every JSONL record with production code,
and calls the deployed read-only connection-test route. It does not write catalog data.

```powershell
Remove-Item Env:AWIN_RUN_STAGING_IMPORT -ErrorAction SilentlyContinue
pnpm --filter @profit-pilot/api verify:staging:awin-contract
```

Accept only a JSON result with `status: "passed"`, `stagingApi.connection: "verified"`, at least one
received and accepted product, no final-line error object, and a rejection rate at or below 5%.
The score version must be `awin-v1.0.0`.

## 5. Exercise the real staging import

This step mutates the staging catalog and audit trail. Confirm the selected tenant/feed and snapshot
before enabling it.

```powershell
$env:AWIN_RUN_STAGING_IMPORT = 'true'
pnpm verify:staging:awin
```

Accept `stagingApi.import: "ingested"` and then inspect the tenant-scoped state using the application
or approved read-only operations path:

- `feed_sync_states.status = 'succeeded'`;
- `last_product_count` equals accepted products and `last_rejected_count` equals rejected products;
- `lease_expires_at` is null and `next_eligible_at` is about 15 minutes after completion;
- products carry the connection ID and source IDs prefixed with `awin:<advertiserId>:`;
- opportunity rows use `awin-v1.0.0` and have one row per product/version/timestamp;
- audit events contain `awin.feed_sync.started` followed by `awin.feed_sync.succeeded` for the same
  feed-sync target.

Do not rerun inside the 15-minute freshness window. After the window, rerun once without changing the
feed. If Awin supplies and honors the saved validator, accept `stagingApi.import: "not_modified"` and
confirm `awin.feed_sync.not_modified`; otherwise a second safe `ingested` result is acceptable because
ETag and Last-Modified support is provider-response dependent.

## 6. Negative checks

Run each check once and record only status codes and request IDs:

1. Use a user without `connections:manage`; both Awin routes must return `403`.
2. Use a workspace outside the user's tenant; both routes must fail tenant resolution.
3. Point a disposable pending connection at a nonexistent secret reference; import must fail with a
   sanitized secret-resolution problem and must not expose AWS or token details.
4. Use an invalid publisher, advertiser, or locale in a disposable request; the connector must fail
   without replacing the existing catalog.
5. Start two imports for the same feed; the second must return the in-progress conflict while the
   first lease is valid.

## 7. Release evidence and cleanup

Attach the commit/image digests, migration output, the two verifier JSON summaries, API request IDs,
feed-sync/audit identifiers, product counts, timestamps, and pass/fail decisions to the release
record. Redact database URLs, OIDC tokens, and secret values. Keep the secret reference only if the
release system is approved to store infrastructure identifiers.

```powershell
Remove-Item Env:DATABASE_ADMIN_URL,Env:DATABASE_URL,Env:AWIN_STAGING_AUTH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:AWIN_RUN_STAGING_IMPORT -ErrorAction SilentlyContinue
```

Any secret leak, cross-tenant visibility, migration mismatch, parser rejection above 5%, incomplete
feed sentinel, missing audit transition, or unresolved import failure blocks promotion.
