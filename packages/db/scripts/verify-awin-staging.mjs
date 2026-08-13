import { randomUUID } from "node:crypto";

import postgres from "postgres";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) {
    throw new Error(`${name} is required and must be a single non-empty value`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedPolicies = new Map([
  ["affiliate_connections", ["affiliate_connections_tenant_access"]],
  ["feed_sync_states", ["feed_sync_states_tenant_access"]],
  ["products", ["products_tenant_access"]],
  ["opportunities", ["opportunities_tenant_access"]],
  ["audit_events", ["audit_events_tenant_append", "audit_events_tenant_read"]],
]);

const expectedIndexes = [
  "feed_sync_states_source_unique",
  "products_source_identity_unique",
  "opportunities_product_version_time_unique",
];

async function tenantConnection(database, organizationId, workspaceId, connectionId) {
  return database.begin(async (transaction) => {
    await transaction`select set_config('app.current_organization_id', ${organizationId}, true)`;
    await transaction`select set_config('app.current_workspace_id', ${workspaceId}, true)`;
    return transaction`
      select
        id::text,
        provider::text,
        status::text,
        secret_reference,
        last_verified_at,
        policy_version
      from affiliate_connections
      where id = ${connectionId}::uuid
    `;
  });
}

async function main() {
  const adminUrl = requiredEnvironment("DATABASE_ADMIN_URL");
  const applicationUrl = requiredEnvironment("DATABASE_URL");
  const organizationId = requiredEnvironment("AWIN_ORGANIZATION_ID");
  const workspaceId = requiredEnvironment("AWIN_WORKSPACE_ID");
  const connectionId = requiredEnvironment("AWIN_CONNECTION_ID");
  const secretReference = requiredEnvironment("AWIN_SECRET_REFERENCE");
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  const application = postgres(applicationUrl, { max: 1, prepare: false });

  try {
    const [journal] = await admin`
      select to_regclass('drizzle.__drizzle_migrations')::text as name
    `;
    assert(journal?.name, "The Drizzle migration journal is missing");
    const [migrationState] = await admin`
      select count(*)::int as count, max(created_at)::text as latest
      from drizzle.__drizzle_migrations
    `;
    assert(
      migrationState && migrationState.count >= 6,
      "The migration journal does not include the Awin feed migration sequence through 0005",
    );

    for (const [tableName, requiredPolicies] of expectedPolicies) {
      const [table] = await admin`
        select c.relrowsecurity as "rowSecurity", c.relforcerowsecurity as "forceRowSecurity"
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = ${tableName}
      `;
      assert(table, `Required table ${tableName} is missing`);
      assert(table.rowSecurity, `Row-level security is disabled on ${tableName}`);
      assert(table.forceRowSecurity, `Forced row-level security is disabled on ${tableName}`);

      const policies = await admin`
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = ${tableName}
      `;
      const names = new Set(policies.map((policy) => policy.policyname));
      for (const policyName of requiredPolicies) {
        assert(names.has(policyName), `Required policy ${policyName} is missing`);
      }
    }

    for (const indexName of expectedIndexes) {
      const [index] = await admin`
        select to_regclass(${`public.${indexName}`})::text as name
      `;
      assert(index?.name, `Required index ${indexName} is missing`);
    }

    const [applicationRole] = await application`
      select current_user as name, rolsuper, rolbypassrls
      from pg_roles
      where rolname = current_user
    `;
    assert(applicationRole, "The application database role could not be inspected");
    assert(!applicationRole.rolsuper, "DATABASE_URL must not use a superuser role");
    assert(!applicationRole.rolbypassrls, "DATABASE_URL must not use a BYPASSRLS role");

    const visible = await tenantConnection(application, organizationId, workspaceId, connectionId);
    assert(visible.length === 1, "The Awin connection is not visible in its declared tenant");
    const [connection] = visible;
    assert(connection.provider === "awin", "The connection provider is not awin");
    assert(connection.status === "active", "The Awin connection is not active");
    assert(
      connection.secret_reference === secretReference,
      "The database secret_reference does not match AWIN_SECRET_REFERENCE",
    );
    assert(connection.last_verified_at, "The Awin connection has no last_verified_at timestamp");
    assert(connection.policy_version, "The Awin connection has no policy_version");

    let mismatchedOrganizationId = randomUUID();
    let mismatchedWorkspaceId = randomUUID();
    if (mismatchedOrganizationId === organizationId) mismatchedOrganizationId = randomUUID();
    if (mismatchedWorkspaceId === workspaceId) mismatchedWorkspaceId = randomUUID();
    const hidden = await tenantConnection(
      application,
      mismatchedOrganizationId,
      mismatchedWorkspaceId,
      connectionId,
    );
    assert(hidden.length === 0, "RLS exposed the Awin connection to a mismatched tenant context");

    console.log(
      JSON.stringify(
        {
          status: "passed",
          migrationCount: migrationState.count,
          latestMigrationAt: migrationState.latest,
          applicationRole: applicationRole.name,
          connectionId,
          secretReference,
          rlsTables: [...expectedPolicies.keys()],
          tenantIsolation: "passed",
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([admin.end({ timeout: 5 }), application.end({ timeout: 5 })]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Awin database verification failed");
  process.exitCode = 1;
});
