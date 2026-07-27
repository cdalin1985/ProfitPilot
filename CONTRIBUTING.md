# Contributing

Create changes from a current `main` branch and keep each pull request focused on one outcome. Use conventional commit subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) and explain risk, verification, rollout, and rollback in the pull request.

Before requesting review, run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

New database access must use a tenant-scoped transaction and include a negative cross-tenant test. Schema changes must be additive or otherwise backward compatible with the currently deployed application. New external side effects must be idempotent, auditable, retry-safe, and disabled until their credentials and policy are verified.

Do not commit credentials, real customer data, generated production exports, local environment files, or Terraform state.
