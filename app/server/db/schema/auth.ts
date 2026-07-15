import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * Auth.js Drizzle adapter tables (M4-T2).
 *
 * The standard `accounts` / `sessions` / `verification_tokens` structures the
 * adapter defines (`database.md` §5.1). Landed as DDL now so M5 can wire the
 * adapter without a migration scramble; the Drizzle property names match what
 * `@auth/drizzle-adapter` references, DB columns are snake_case via the client
 * casing. Magic-link email sign-in uses `verification_tokens`.
 *
 * @see https://authjs.dev/getting-started/adapters/drizzle
 * @see docs/03-architecture/backend.md §7
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp({ withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (token) => [primaryKey({ columns: [token.identifier, token.token] })],
);
