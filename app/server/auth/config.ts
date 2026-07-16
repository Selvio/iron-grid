import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";

import { createDatabase, type Database, schema } from "../db";

import { requireAuthSecret } from "./env";

/**
 * Auth.js configuration, bound to the M4 identity tables (M5-T1).
 *
 * The Drizzle adapter reads and writes the `users` / `accounts` / `sessions` /
 * `verification_tokens` tables **already created in M4-T2** (`database.md` §5.1)
 * — M5 wires them, it does not redefine identity schema. Sessions are stored in
 * the database (not JWT) so the adapter is the single source of truth for
 * identity. The magic-link email provider is registered in **M5-T2**; the
 * `providers` array is intentionally empty here.
 *
 * `buildAuthConfig` is passed to `NextAuth` in its **lazy** form so the database
 * handle and `AUTH_SECRET` are resolved per request, never at module load —
 * importing this file performs no I/O and reads no env (`db/env.ts` discipline).
 *
 * @see docs/03-architecture/backend.md §7
 * @see docs/03-architecture/database.md §5.1
 * @see docs/04-development/milestones/m5-auth.md (M5-T1)
 */

// Memoized per process: the pooled Neon client is reused across requests within
// a warm runtime rather than reconnecting each call. Created lazily on first
// request so importing this module touches neither env nor the network.
let cachedDatabase: Database | undefined;

function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

/** Builds the Auth.js config; invoked lazily by `NextAuth` per request. */
export function buildAuthConfig(): NextAuthConfig {
  return {
    adapter: DrizzleAdapter(database(), {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    session: { strategy: "database" },
    secret: requireAuthSecret(),
    // Magic-link email provider registered in M5-T2.
    providers: [],
  };
}
