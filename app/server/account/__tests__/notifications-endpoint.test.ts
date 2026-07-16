import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES, users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import {
  handleGetNotifications,
  handlePatchNotifications,
} from "../notifications-endpoint";

/** A resolver that returns a database-strategy session for the given user id. */
function sessionFor(userId: string): () => Promise<Session | null> {
  return async () => ({
    user: { id: userId, email: "player@example.edu", name: null, image: null },
    expires: "2026-08-01T00:00:00.000Z",
  });
}

/** Builds a PATCH request with a raw (possibly invalid) JSON body string. */
function patchRequest(rawBody: string): Request {
  return new Request("https://iron-grid.test/api/me/notifications", {
    method: "PATCH",
    body: rawBody,
  });
}

describe("notifications endpoint", () => {
  let handle: TestDb;
  let userId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    const [row] = await handle.db
      .insert(users)
      .values({ email: "player@example.edu" })
      .returning();
    userId = row.id;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("GET returns the stored preferences for the authenticated user", async () => {
    const response = await handleGetNotifications({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("GET returns 401 when unauthenticated", async () => {
    const response = await handleGetNotifications({
      db: handle.db,
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });

  it("GET returns 401 when the session user no longer exists", async () => {
    const response = await handleGetNotifications({
      db: handle.db,
      resolveSession: sessionFor("ghost"),
    });
    expect(response.status).toBe(401);
  });

  it("PATCH updates the targeted toggles and returns the merged set", async () => {
    const response = await handlePatchNotifications(
      patchRequest(
        JSON.stringify({ turn_expired: true, match_completed: false }),
      ),
      { db: handle.db, resolveSession: sessionFor(userId) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      turn_expired: true,
      match_completed: false,
    });

    // Persisted: a follow-up GET reflects the change.
    const after = await handleGetNotifications({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    expect((await after.json()).turn_expired).toBe(true);
  });

  it("PATCH rejects an unknown key with 400", async () => {
    const response = await handlePatchNotifications(
      patchRequest(JSON.stringify({ invented: true })),
      { db: handle.db, resolveSession: sessionFor(userId) },
    );
    expect(response.status).toBe(400);
  });

  it("PATCH rejects a malformed JSON body with 400", async () => {
    const response = await handlePatchNotifications(patchRequest("not json"), {
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    expect(response.status).toBe(400);
  });

  it("PATCH returns 401 when unauthenticated, before any write", async () => {
    const response = await handlePatchNotifications(
      patchRequest(JSON.stringify({ turn_started: false })),
      { db: handle.db, resolveSession: async () => null },
    );
    expect(response.status).toBe(401);
  });
});
