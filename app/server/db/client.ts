import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import { requireDatabaseUrl } from "./env";
import * as schema from "./schema";

/**
 * The Drizzle client over Neon's serverless driver (M4-T1).
 *
 * Mutations run on the Node.js runtime inside transactions with row locks
 * (`backend.md` §2, §8), so the **pooled** (WebSocket) driver is used rather than
 * the HTTP one — the HTTP driver cannot hold an interactive transaction. Table
 * definitions arrive in later M4 tickets; the client is wired now so those
 * slices, migrations and the concurrency primitives share one typed handle.
 *
 * `casing: "snake_case"` lets schema slices declare camelCase TypeScript fields
 * that map to the snake_case columns `database.md` §5 specifies, with no manual
 * column-name duplication.
 *
 * @see docs/03-architecture/database.md §2, §3
 * @see docs/03-architecture/backend.md §2
 */

/** The full schema type — grows as M4 tickets add table slices. */
export type Schema = typeof schema;

/** A Drizzle database handle bound to the Iron Grid schema. */
export type Database = NeonDatabase<Schema>;

function createPool(connectionString: string): Pool {
  // Neon's pooled driver needs a WebSocket constructor in Node. Node 22+ ships a
  // global one; wire it once if the host has not set an explicit constructor.
  if (
    neonConfig.webSocketConstructor === undefined &&
    typeof WebSocket !== "undefined"
  ) {
    neonConfig.webSocketConstructor = WebSocket as never;
  }
  return new Pool({ connectionString });
}

/**
 * Builds a Drizzle client. Defaults to the pinned `DATABASE_URL`; an explicit
 * connection string is accepted for tooling and tests.
 */
export function createDatabase(
  connectionString: string = requireDatabaseUrl(),
): Database {
  return drizzle(createPool(connectionString), {
    schema,
    casing: "snake_case",
  });
}
