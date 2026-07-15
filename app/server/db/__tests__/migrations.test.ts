import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "./harness";

const EXPECTED_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "matches",
  "match_players",
  "events",
  "player_events",
  "idempotency_keys",
  "notification_jobs",
];

describe("migrations", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("apply forward-only from an empty database and create every table", async () => {
    await handle.applyMigrations();

    const result = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(EXPECTED_TABLES),
    );
  });
});
