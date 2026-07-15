import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getPinnedGameDataVersion,
  pinGameDataVersion,
} from "../queries/versioning";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

describe("data-version pinning", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("pins a version at activation and reads it back", async () => {
    expect(await getPinnedGameDataVersion(handle.db, "match-1")).toBeNull();

    await pinGameDataVersion(handle.db, "match-1", "data-2026-07-14");
    expect(await getPinnedGameDataVersion(handle.db, "match-1")).toBe(
      "data-2026-07-14",
    );
  });

  it("is immutable once pinned", async () => {
    await pinGameDataVersion(handle.db, "match-1", "data-a");
    await expect(
      pinGameDataVersion(handle.db, "match-1", "data-b"),
    ).rejects.toThrow(/immutable/);
    expect(await getPinnedGameDataVersion(handle.db, "match-1")).toBe("data-a");
  });
});
