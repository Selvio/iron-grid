import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordIdempotentResult } from "../queries/idempotency";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

describe("idempotency keys", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("records a fresh key and reports it not replayed", async () => {
    const outcome = await recordIdempotentResult(handle.db, "match-1", "k1", {
      ok: true,
    });
    expect(outcome).toEqual({ replayed: false, result: { ok: true } });
  });

  it("replays the original result for a duplicate key", async () => {
    await recordIdempotentResult(handle.db, "match-1", "k1", { seq: 1 });

    // A second call with the same key but a different result must return the
    // stored original, never re-apply.
    const outcome = await recordIdempotentResult(handle.db, "match-1", "k1", {
      seq: 2,
    });
    expect(outcome).toEqual({ replayed: true, result: { seq: 1 } });
  });

  it("scopes keys per match", async () => {
    await insertDraftMatch(handle, "match-2", "XYZ789");
    await recordIdempotentResult(handle.db, "match-1", "k1", { m: 1 });

    const outcome = await recordIdempotentResult(handle.db, "match-2", "k1", {
      m: 2,
    });
    expect(outcome).toEqual({ replayed: false, result: { m: 2 } });
  });
});
