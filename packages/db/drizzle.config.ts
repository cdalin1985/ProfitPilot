import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_ADMIN_URL is required to run database migrations");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
