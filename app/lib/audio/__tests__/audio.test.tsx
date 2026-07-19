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
  it("picks the select clip off the chassis and the attack clip off the weapon", () => {
    expect(soundsFor("infantry")).toEqual({
      select: "select_foot",
      attack: "attack_rifle",
    });
    expect(soundsFor("mech")).toEqual({
      select: "select_foot",
      attack: "attack_bazooka",
    });
    expect(soundsFor("tank")).toEqual({
      select: "select_treads",
      attack: "attack_tank",
    });
    expect(soundsFor("fighter").select).toBe("select_air");
    expect(soundsFor("battleship").select).toBe("select_naval");
  });

  it("follows units.yaml's movement type, not the weapon, when selecting", () => {
    // Rockets and missiles ride on tyres, so they answer like the recon rather
    // than like the artillery they shoot as.
    expect(soundsFor("rockets").select).toBe(soundsFor("recon").select);
    expect(soundsFor("missiles").select).toBe("select_wheels");
    expect(soundsFor("rockets").attack).toBe("attack_cannon");
    // The artillery is tracked, so it sounds like a tank pulling away.
    expect(soundsFor("artillery").select).toBe("select_treads");
    expect(soundsFor("artillery").attack).toBe("attack_cannon");
    // The APC is tracked too, and carries no gun.
    expect(soundsFor("apc")).toEqual({
      select: "select_treads",
      attack: "attack_default",
    });
  });

  it("falls back for a unit it has never heard of", () => {
    expect(soundsFor("no_such_unit")).toEqual({
      select: "select_foot",
      attack: "attack_default",
    });
  });
});
