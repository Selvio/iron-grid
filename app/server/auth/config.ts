import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";

import { createDatabase, type Database, schema } from "../db";

import { requireAuthSecret } from "./env";
import { magicLinkProvider } from "./providers/magic-link";

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
 * The magic-link provider (M5-T2) is registered here; the `session` callback
 * exposes the stable `user.id` the current-user helper reads (M5-T3).
 *
 * @see docs/03-architecture/backend.md §7
 * @see docs/03-architecture/database.md §5.1
 * @see docs/04-development/milestones/m5-auth.md (M5-T1, T2, T3)
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
    // Self-hosted (non-Vercel) Next: trust the deployment's own host so the
    // magic-link sign-in/callback works in production. Without this, Auth.js only
    // trusts the host when `AUTH_URL`/`AUTH_TRUST_HOST` is set and would reject
    // the callback with `UntrustedHost` under a bare `NODE_ENV=production`. The
    // canonical origin is still pinned by `AUTH_URL` when present (`backend.md` §2).
    trustHost: true,
    // Point Auth.js at the branded M9 screens instead of its built-in pages: an
    // unauthenticated redirect and the post-send "check your inbox" state both
    // land on `/sign-in` (M9-T2). The magic-link email itself is unchanged.
    pages: {
      signIn: "/sign-in",
      verifyRequest: "/sign-in?sent=1",
    },
    providers: [magicLinkProvider()],
    callbacks: {
      // Database sessions carry the adapter user, but the default `Session.user`
      // omits `id`. Surface the stable id so the current-user helper (M5-T3) and
      // the membership guard (M5-T4) key off it rather than re-reading the row.
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
  };
}
