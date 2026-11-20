import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration. Run from the repository root:
 *
 *   pnpm db:generate   # writes database/migrations/*.sql and bundle.ts
 *
 * Migrations are applied by the app itself at startup (`src/server/db`), on
 * Postgres and PGlite alike, so no `drizzle-kit migrate` step is needed.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./database/schema.ts",
  out: "./database/migrations",
});
