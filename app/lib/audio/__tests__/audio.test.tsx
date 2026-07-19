import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isMuted,
  resetMutedCache,
  setMuted,
  subscribeMuted,
  toggleMuted,
} from "../settings";
import { playSfx } from "../sfx";
import { soundsFor } from "../unit-sounds";

/**
 * Audio module tests (M12).
 *
 * The playback path itself is unverifiable here — jsdom has no Web Audio — but
 * that *is* the contract worth pinning: the module must go quiet rather than
 * throw wherever the API is missing, or every board test would fail on a sound.
 */

afterEach(() => {
  window.localStorage.clear();
  resetMutedCache();
});

describe("sound settings", () => {
  it("starts unmuted and survives a reload", () => {
    expect(isMuted()).toBe(false);

    setMuted(true);
    expect(isMuted()).toBe(true);
    // A fresh page load reads the preference back out of storage.
    resetMutedCache();
    expect(isMuted()).toBe(true);
  });

  it("toggles and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMuted(listener);

    expect(toggleMuted()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(toggleMuted()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    toggleMuted();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the preference in memory when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    setItem.mockRestore();
  });
});

describe("playSfx", () => {
  it("is a no-op where Web Audio does not exist", () => {
    expect(() => playSfx("ui_confirm")).not.toThrow();
  });
});

describe("soundsFor", () => {
  it("gives each family the clip the source project chose for it", () => {
    expect(soundsFor("infantry")).toEqual({
      select: "select_foot",
      attack: "attack_rifle",
    });
    expect(soundsFor("mech").attack).toBe("attack_bazooka");
    expect(soundsFor("recon")).toEqual({
      select: "select_wheels",
      attack: "attack_recon",
    });
    expect(soundsFor("artillery").attack).toBe("attack_cannon");
    expect(soundsFor("tank")).toEqual({
      select: "select_treads",
      attack: "attack_tank",
    });
    expect(soundsFor("fighter").select).toBe("select_air");
    expect(soundsFor("battleship").select).toBe("select_naval");
  });

  it("extends a family's clip to the units the original never voiced", () => {
    // The source project only sounded ten units; ours share by family rather
    // than falling back to one beep for two thirds of the roster.
    expect(soundsFor("neotank")).toEqual(soundsFor("tank"));
    expect(soundsFor("rockets")).toEqual(soundsFor("artillery"));
    expect(soundsFor("bomber")).toEqual(soundsFor("fighter"));
    expect(soundsFor("submarine_submerged")).toEqual(soundsFor("battleship"));
  });

  it("falls back for a unit it has never heard of", () => {
    expect(soundsFor("no_such_unit")).toEqual({
      select: "select_foot",
      attack: "attack_default",
    });
  });
});
