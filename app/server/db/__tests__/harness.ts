import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "../schema";

/**
 * In-process Postgres test harness (M4-T1).
 *
 * Schema shape, constraints, migration apply and the version-compare logic run
 * against PGlite for speed and hermeticity (`testing.md` §6). The one test that
 * needs two real concurrent connections — the `FOR UPDATE` row-lock
 * serialization — uses a separate multi-connection harness added with that test
 * in M4-T7 (see `m4-persistence.md` §3); PGlite is single-connection and cannot
 * prove true lock contention.
 *
 * @see docs/04-development/milestones/m4-persistence.md §3
 * @see docs/04-development/testing.md §6
 */

/** A Drizzle handle backed by an ephemeral in-memory PGlite database. */
export type TestDatabase = PgliteDatabase<typeof schema>;

export interface TestDb {
  /** The Drizzle client bound to the Iron Grid schema. */
  readonly db: TestDatabase;
  /** The underlying PGlite instance (for raw SQL / teardown). */
  readonly client: PGlite;
  /** Applies every checked-in migration in `./drizzle` in filename order. */
  applyMigrations(): Promise<void>;
  /** Disposes the database; call in an `afterEach`. */
  close(): Promise<void>;
}

/** Repo-root `drizzle/` migrations directory, resolved from this file. */
const migrationsDir = fileURLToPath(
  new URL("../../../../drizzle/", import.meta.url),
);

/** Spins up a fresh, isolated in-memory Postgres for one test. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });

  return {
    db,
    client,
    async applyMigrations() {
      if (!existsSync(migrationsDir)) return;
      const files = readdirSync(migrationsDir)
        .filter((name) => name.endsWith(".sql"))
        .sort();
      for (const file of files) {
        const sqlText = readFileSync(migrationsDir + file, "utf8");
        // Drizzle Kit separates statements with this marker.
        for (const statement of sqlText.split("--> statement-breakpoint")) {
          const trimmed = statement.trim();
          if (trimmed.length > 0) await client.exec(trimmed);
        }
      }
    },
    async close() {
      await client.close();
    },
  };
}
