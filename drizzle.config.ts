import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration (M4-T1).
 *
 * `db:generate` diffs the schema barrel against `./drizzle` and emits forward-only
 * SQL (no database connection needed); `db:migrate`/`db:studio` connect via
 * `DATABASE_URL`. Migrations are checked in and applied forward-only
 * (`database.md` §9). `casing` matches the runtime client so generated column
 * names stay snake_case (`database.md` §5).
 *
 * @see docs/03-architecture/database.md §9
 * @see docs/04-development/milestones/m4-persistence.md (M4-T1, M4-T7)
 */
export default defineConfig({
  schema: "./app/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
