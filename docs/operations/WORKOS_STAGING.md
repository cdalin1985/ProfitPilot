# WorkOS staging activation

This runbook activates the real WorkOS AuthKit boundary locally without placing credentials in source control, shell history, chat, CI variables, or documentation.

## Dashboard baseline

Use the WorkOS **Staging** environment and the default **Profit Pilot Web** application. Before testing, verify:

- Redirect URI: `http://localhost:3000/auth/callback`.
- App homepage: `http://localhost:3000/`.
- Initiate login URI: `http://localhost:3000/sign-in`.
- Default sign-out URI: `http://localhost:3000/`.
- Maximum session length: 7 days.
- Access token duration: 5 minutes.
- Inactivity timeout: 1 day.
- Application-user MFA: required for non-SSO users.
- Environment role slug: `admin` for the organization owner.
- User impersonation: disabled.
- JWT template: `{"aud":"urn:profit-pilot:control-plane"}`.

Keep WorkOS dashboard MCP access read-only and limited to sandbox environments unless a reviewed operational task requires broader access. Production access and write access remain disabled by default.

## Secure local configuration

From the repository root, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-workos-staging.ps1 -ClientId client_01KYZQAG48RA4J4QXFJQ9GD807
```

When prompted, paste the staging API key directly into the masked terminal prompt. The script:

1. Creates the ignored root `.env` from `.env.example` when necessary.
2. Configures OIDC with the application-specific JWKS URL, exact WorkOS issuer, and fixed API audience.
3. Stores the API key without printing it.
4. Generates independent cryptographically random values for the encrypted WorkOS cookie and audit-IP HMAC key.
5. Leaves existing secret values unchanged on subsequent runs.

Never paste the API key into chat, a GitHub issue, a pull request, source code, or a committed environment file. If a key is exposed, revoke it in WorkOS and replace it immediately.

## Local verification

Start dependencies, apply migrations, and launch the services:

```powershell
pnpm db:local:start
pnpm dev
```

The native database helper is the recommended Windows path. It uses the pinned official EDB PostgreSQL 17 archive, verifies its checksum before extraction, stores binaries and data only under the ignored `.data` directory, binds PostgreSQL to `127.0.0.1`, creates the same roles as Compose, and applies all migrations. Use `pnpm db:local:stop` for a clean shutdown. Redis remains in `compose.yaml` for later vertical slices but is not required by the current WorkOS onboarding path.

Verify the following in order:

1. An unauthenticated visit to `http://localhost:3000/overview` redirects to AuthKit.
2. A verified user completes MFA and returns through `/auth/callback`.
3. The first organization/workspace onboarding completes once and a retry does not create duplicates.
4. The API accepts the WorkOS token only when its signature, issuer, `aud`, expiry, subject, session ID, and organization ID are valid.
5. A token for a different audience, organization, or expired session is denied.
6. Sign-out clears the local session and returns to the approved homepage.

Do not activate WorkOS Production or add production redirects until the production domain, support mailbox, billing owner, secret-manager destinations, and deployment endpoint are approved.
