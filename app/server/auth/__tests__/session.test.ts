import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { UnauthenticatedError } from "../errors";
import { getCurrentUser, requireUser } from "../session";

/** A resolver that always returns the given session (or `null`). */
function resolver(session: Session | null): () => Promise<Session | null> {
  return async () => session;
}

/** A database-strategy session as Auth.js hands it to callers post-callback. */
function sessionFor(id: string, email: string): Session {
  return {
    user: { id, email, name: "Commander", image: null },
    expires: "2026-08-01T00:00:00.000Z",
  };
}

describe("getCurrentUser", () => {
  it("resolves the authenticated user from a valid session", async () => {
    const user = await getCurrentUser(
      resolver(sessionFor("user-1", "host@example.edu")),
    );
    expect(user).not.toBeNull();
    expect(user?.id).toBe("user-1");
    expect(user?.email).toBe("host@example.edu");
  });

  it("returns null when there is no session", async () => {
    expect(await getCurrentUser(resolver(null))).toBeNull();
  });

  it("treats a session without a user id as signed out", async () => {
    const idless = {
      user: { email: "ghost@example.edu" },
      expires: "2026-08-01T00:00:00.000Z",
    } as unknown as Session;
    expect(await getCurrentUser(resolver(idless))).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the user when authenticated", async () => {
    const user = await requireUser(
      resolver(sessionFor("user-2", "guest@example.edu")),
    );
    expect(user.id).toBe("user-2");
  });

  it("raises the typed 401 when unauthenticated", async () => {
    await expect(requireUser(resolver(null))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(requireUser(resolver(null))).rejects.toMatchObject({
      status: 401,
    });
  });
});
