import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { accounts, sessions, verificationTokens } from "../schema/auth";
import { matchPlayers } from "../schema/match-players";
import { DEFAULT_NOTIFICATION_PREFERENCES, users } from "../schema/users";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

describe("users and Auth.js adapter tables", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("applies notification defaults and generates id/created_at", async () => {
    await handle.db.insert(users).values({ email: "a@example.edu" });

    const [row] = await handle.db.select().from(users);
    expect(row.id).toMatch(/[0-9a-f-]{36}/);
    expect(row.notificationPreferences).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.emailVerified).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    await handle.db.insert(users).values({ email: "a@example.edu" });
    await expect(
      handle.db.insert(users).values({ email: "a@example.edu" }),
    ).rejects.toThrow();
  });

  it("round-trips a magic-link verification token", async () => {
    await handle.db.insert(verificationTokens).values({
      identifier: "a@example.edu",
      token: "tok-1",
      expires: new Date("2026-07-15T00:00:00.000Z"),
    });
    const [row] = await handle.db.select().from(verificationTokens);
    expect(row).toMatchObject({ identifier: "a@example.edu", token: "tok-1" });
  });

  it("cascades account and session deletion with the user", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: "a@example.edu" })
      .returning();
    await handle.db.insert(accounts).values({
      userId: user.id,
      type: "email",
      provider: "resend",
      providerAccountId: "a@example.edu",
    });
    await handle.db.insert(sessions).values({
      sessionToken: "sess-1",
      userId: user.id,
      expires: new Date("2026-08-01T00:00:00.000Z"),
    });

    await handle.db.delete(users);

    expect(await handle.db.select().from(accounts)).toHaveLength(0);
    expect(await handle.db.select().from(sessions)).toHaveLength(0);
  });

  it("rejects a session for an unknown user", async () => {
    await expect(
      handle.db.insert(sessions).values({
        sessionToken: "sess-x",
        userId: "ghost",
        expires: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });

  it("enforces the match_players.user_id FK to users", async () => {
    await insertDraftMatch(handle);
    await expect(
      handle.db.insert(matchPlayers).values({
        id: "p1",
        matchId: "match-1",
        role: "host",
        userId: "ghost",
      }),
    ).rejects.toThrow();

    const [user] = await handle.db
      .insert(users)
      .values({ email: "host@example.edu" })
      .returning();
    await handle.db.insert(matchPlayers).values({
      id: "p1",
      matchId: "match-1",
      role: "host",
      userId: user.id,
    });
    expect(await handle.db.select().from(matchPlayers)).toHaveLength(1);
  });
});
