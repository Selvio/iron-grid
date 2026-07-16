import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES, users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import {
  getNotificationPreferences,
  NOTIFICATION_PREFERENCE_KEYS,
  parseNotificationPreferencesPatch,
  PreferencesValidationError,
  updateNotificationPreferences,
} from "../notification-preferences";

describe("parseNotificationPreferencesPatch", () => {
  it("accepts a subset of known boolean toggles", () => {
    const patch = parseNotificationPreferencesPatch({
      turn_expired: true,
      match_completed: false,
    });
    expect(patch).toEqual({ turn_expired: true, match_completed: false });
  });

  it("accepts exactly the rules.yaml default_preferences keys", () => {
    // The accepted set is derived from the M4 defaults, which mirror rules.yaml.
    expect([...NOTIFICATION_PREFERENCE_KEYS].sort()).toEqual(
      Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).sort(),
    );
  });

  it("rejects an unknown key", () => {
    expect(() =>
      parseNotificationPreferencesPatch({ turn_started: true, invented: true }),
    ).toThrow(PreferencesValidationError);
  });

  it("rejects a non-boolean value", () => {
    expect(() =>
      parseNotificationPreferencesPatch({ turn_started: "yes" }),
    ).toThrow(PreferencesValidationError);
  });

  it("rejects an empty body and a non-object", () => {
    expect(() => parseNotificationPreferencesPatch({})).toThrow(
      PreferencesValidationError,
    );
    expect(() => parseNotificationPreferencesPatch([])).toThrow(
      PreferencesValidationError,
    );
    expect(() => parseNotificationPreferencesPatch(null)).toThrow(
      PreferencesValidationError,
    );
  });
});

describe("notification-preferences store", () => {
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

  it("returns the stored defaults for a fresh user", async () => {
    const prefs = await getNotificationPreferences(handle.db, userId);
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns null for an unknown user", async () => {
    expect(await getNotificationPreferences(handle.db, "ghost")).toBeNull();
  });

  it("updates the targeted toggles and leaves the rest intact", async () => {
    // Defaults have turn_expired:false, match_completed:true.
    const updated = await updateNotificationPreferences(handle.db, userId, {
      turn_expired: true,
      match_completed: false,
    });

    expect(updated).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      turn_expired: true,
      match_completed: false,
    });

    // The change is persisted, and untouched keys keep their default value.
    const reread = await getNotificationPreferences(handle.db, userId);
    expect(reread?.turn_expired).toBe(true);
    expect(reread?.match_completed).toBe(false);
    expect(reread?.turn_started).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES.turn_started,
    );
  });

  it("returns null when updating an unknown user", async () => {
    expect(
      await updateNotificationPreferences(handle.db, "ghost", {
        turn_started: false,
      }),
    ).toBeNull();
  });
});
