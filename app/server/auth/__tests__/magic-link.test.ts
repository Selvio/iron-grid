import type { EmailProviderSendVerificationRequestParams } from "next-auth/providers/email";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES, users } from "../../db/schema/users";
import {
  magicLinkProvider,
  type MagicLinkEmail,
  type MagicLinkMailer,
} from "../providers/magic-link";
import { createAuthTestDb, type AuthTestDb } from "./harness";

/** A mailer that records what it was asked to send instead of hitting Resend. */
function recordingMailer(): {
  readonly sent: MagicLinkEmail[];
  mailer: MagicLinkMailer;
} {
  const sent: MagicLinkEmail[] = [];
  return {
    sent,
    mailer: {
      async send(email) {
        sent.push(email);
      },
    },
  };
}

/** Builds `sendVerificationRequest` params; the provider only reads two fields. */
function sendParams(
  overrides: Partial<EmailProviderSendVerificationRequestParams>,
): EmailProviderSendVerificationRequestParams {
  return {
    identifier: "player@example.edu",
    url: "https://iron-grid.test/api/auth/callback/magic-link?token=tok-123&email=player%40example.edu",
    expires: new Date("2026-07-17T00:00:00.000Z"),
    token: "tok-123",
    theme: {},
    request: new Request("https://iron-grid.test/api/auth/signin/magic-link"),
    ...overrides,
  } as EmailProviderSendVerificationRequestParams;
}

describe("magic-link provider delivery", () => {
  it("hands the sign-in link and target address to the injected mailer", async () => {
    const { sent, mailer } = recordingMailer();
    const provider = magicLinkProvider(mailer);

    await provider.sendVerificationRequest(
      sendParams({ identifier: "player@example.edu" }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("player@example.edu");
    expect(sent[0].url).toContain("token=tok-123");
  });

  it("surfaces a delivery failure so sign-in fails loudly", async () => {
    const provider = magicLinkProvider({
      async send() {
        throw new Error("Resend rejected the request");
      },
    });

    await expect(
      provider.sendVerificationRequest(sendParams({})),
    ).rejects.toThrow("Resend rejected the request");
  });

  it("registers as an email provider under the stable id", () => {
    const provider = magicLinkProvider(recordingMailer().mailer);
    expect(provider.type).toBe("email");
    expect(provider.id).toBe("magic-link");
  });
});

describe("magic-link adapter flow", () => {
  let handle: AuthTestDb;

  beforeEach(async () => {
    handle = await createAuthTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("provisions a first-time user with default notification preferences", async () => {
    expect(await handle.adapter.getUserByEmail("new@example.edu")).toBeNull();

    const created = await handle.adapter.createUser({
      id: "user-1",
      email: "new@example.edu",
      emailVerified: new Date("2026-07-16T00:00:00.000Z"),
    });
    expect(created.email).toBe("new@example.edu");

    const [row] = await handle.db.select().from(users);
    expect(row.notificationPreferences).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
  });

  it("issues then single-use-consumes a verification token", async () => {
    await handle.adapter.createVerificationToken({
      identifier: "player@example.edu",
      token: "hashed-token",
      expires: new Date("2026-07-17T00:00:00.000Z"),
    });

    const consumed = await handle.adapter.useVerificationToken({
      identifier: "player@example.edu",
      token: "hashed-token",
    });
    expect(consumed?.identifier).toBe("player@example.edu");

    // Single-use: the same token cannot be redeemed twice.
    const reused = await handle.adapter.useVerificationToken({
      identifier: "player@example.edu",
      token: "hashed-token",
    });
    expect(reused).toBeNull();
  });

  it("resolves the user from an established session", async () => {
    const user = await handle.adapter.createUser({
      id: "user-2",
      email: "host@example.edu",
      emailVerified: new Date("2026-07-16T00:00:00.000Z"),
    });
    await handle.adapter.createSession({
      sessionToken: "sess-token",
      userId: user.id,
      expires: new Date("2026-08-01T00:00:00.000Z"),
    });

    const resolved = await handle.adapter.getSessionAndUser("sess-token");
    expect(resolved?.user.id).toBe(user.id);
    expect(resolved?.user.email).toBe("host@example.edu");
  });
});
