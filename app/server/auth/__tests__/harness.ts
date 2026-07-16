import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";

import * as schema from "../../db/schema";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";

/**
 * Auth integration harness (M5-T2/T3).
 *
 * Reuses the M4 in-process Postgres (PGlite) harness (`testing.md` §6) and binds
 * the Auth.js Drizzle adapter to the same M4 identity tables the runtime config
 * wires, so the magic-link issue→consume→session flow and session resolution run
 * against the real schema without a live database or a live Resend key.
 *
 * @see app/server/db/__tests__/harness.ts
 * @see docs/04-development/milestones/m5-auth.md (M5-T2, T3)
 */
export interface AuthTestDb extends TestDb {
  /** The Auth.js adapter bound to the migrated identity tables. */
  readonly adapter: Required<Adapter>;
}

/** Spins up a migrated PGlite database with the Auth.js adapter attached. */
export async function createAuthTestDb(): Promise<AuthTestDb> {
  const handle = await createTestDb();
  await handle.applyMigrations();
  const adapter = DrizzleAdapter(handle.db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }) as Required<Adapter>;
  return { ...handle, adapter };
}
