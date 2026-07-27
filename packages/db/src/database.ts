import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

let database: Database | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function getDatabase(): Database {
  if (database) {
    return database;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before database access");
  }

  client = postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? "10"),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  database = drizzle(client, { schema });
  return database;
}

export async function closeDatabase(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}

export async function checkDatabaseReady(): Promise<void> {
  await getDatabase().execute(sql`select 1`);
}

async function setActorContext(
  transaction: DatabaseTransaction,
  externalIdentityId: string,
): Promise<void> {
  await transaction.execute(
    sql`select set_config('app.current_actor_external_id', ${externalIdentityId}, true)`,
  );
}

export async function withActor<T>(
  externalIdentityId: string,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await setActorContext(transaction, externalIdentityId);
    return operation(transaction);
  });
}

export async function withTenant<T>(
  organizationId: string,
  workspaceId: string,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
  externalIdentityId?: string,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    if (externalIdentityId) {
      await setActorContext(transaction, externalIdentityId);
    }
    await transaction.execute(
      sql`select set_config('app.current_organization_id', ${organizationId}, true)`,
    );
    await transaction.execute(
      sql`select set_config('app.current_workspace_id', ${workspaceId}, true)`,
    );
    return operation(transaction);
  });
}
