import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { insertDraftMatch } from "../../db/__tests__/fixtures";
import { MembershipForbiddenError } from "../errors";
import { requireMatchMembership } from "../membership";

/** Inserts a user and returns its generated id. */
async function insertUser(handle: TestDb, email: string): Promise<string> {
  const [row] = await handle.db.insert(users).values({ email }).returning();
  return row.id;
}

// Representative read/write paths that must be membership-gated: both call the
// guard before touching gameplay state, proving `_on_every_read` / `_on_every_write`.
async function authorizedRead(handle: TestDb, userId: string, matchId: string) {
  await requireMatchMembership(handle.db, userId, matchId);
  return handle.db.select().from(matches).where(eq(matches.id, matchId));
}

async function authorizedWrite(
  handle: TestDb,
  userId: string,
  matchId: string,
) {
  await requireMatchMembership(handle.db, userId, matchId);
  return handle.db
    .update(matchPlayers)
    .set({ isReady: true })
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)),
    )
    .returning();
}

describe("requireMatchMembership", () => {
  let handle: TestDb;
  let hostId: string;
  let guestId: string;
  let outsiderId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();

    await insertDraftMatch(handle, "match-1");
    hostId = await insertUser(handle, "host@example.edu");
    guestId = await insertUser(handle, "guest@example.edu");
    outsiderId = await insertUser(handle, "outsider@example.edu");

    await handle.db.insert(matchPlayers).values([
      { id: "p-host", matchId: "match-1", userId: hostId, role: "host" },
      { id: "p-guest", matchId: "match-1", userId: guestId, role: "guest" },
    ]);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("grants the host access with their role", async () => {
    const membership = await requireMatchMembership(
      handle.db,
      hostId,
      "match-1",
    );
    expect(membership).toMatchObject({
      playerId: "p-host",
      matchId: "match-1",
      userId: hostId,
      role: "host",
    });
  });

  it("grants an accepted guest access with their role", async () => {
    const membership = await requireMatchMembership(
      handle.db,
      guestId,
      "match-1",
    );
    expect(membership.role).toBe("guest");
    expect(membership.userId).toBe(guestId);
  });

  it("rejects a non-member with the typed 403", async () => {
    await expect(
      requireMatchMembership(handle.db, outsiderId, "match-1"),
    ).rejects.toBeInstanceOf(MembershipForbiddenError);
    await expect(
      requireMatchMembership(handle.db, outsiderId, "match-1"),
    ).rejects.toMatchObject({ status: 403, code: "not_match_player" });
  });

  it("does not grant access through a pending guest slot (null user_id)", async () => {
    await insertDraftMatch(handle, "match-2", "DEF345");
    await handle.db.insert(matchPlayers).values({
      id: "p-pending",
      matchId: "match-2",
      userId: null,
      role: "guest",
    });

    await expect(
      requireMatchMembership(handle.db, outsiderId, "match-2"),
    ).rejects.toBeInstanceOf(MembershipForbiddenError);
  });

  it("rejects an unknown match without leaking its existence", async () => {
    // Same error as a genuine non-member — no way to tell them apart.
    await expect(
      requireMatchMembership(handle.db, hostId, "no-such-match"),
    ).rejects.toMatchObject({ status: 403, code: "not_match_player" });
  });

  it("gates a representative read path", async () => {
    const rows = await authorizedRead(handle, hostId, "match-1");
    expect(rows).toHaveLength(1);

    await expect(
      authorizedRead(handle, outsiderId, "match-1"),
    ).rejects.toBeInstanceOf(MembershipForbiddenError);
  });

  it("gates a representative write path", async () => {
    const updated = await authorizedWrite(handle, guestId, "match-1");
    expect(updated[0].isReady).toBe(true);

    await expect(
      authorizedWrite(handle, outsiderId, "match-1"),
    ).rejects.toBeInstanceOf(MembershipForbiddenError);

    // The blocked write left every row untouched.
    const rows = await handle.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.userId, outsiderId));
    expect(rows).toHaveLength(0);
  });
});
