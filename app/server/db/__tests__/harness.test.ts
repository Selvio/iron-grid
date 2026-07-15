import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "./harness";

describe("db test harness", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("spins up an in-process Postgres that runs SQL", async () => {
    const result = await handle.db.execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });
  });

  it("applies zero migrations cleanly while none exist yet", async () => {
    await expect(handle.applyMigrations()).resolves.toBeUndefined();
  });
});
