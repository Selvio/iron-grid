import type { SfxId } from "./sfx";

/**
 * Which sound a unit makes (M12 audio).
 *
 * Transcribed from the source project's renderers (`view/render/units/**`),
 * where each unit carries its own `selected` and `attack` clip. It only voiced
 * ten units; the rest fell back to a default pair. Rather than leave two thirds
 * of our roster on the same beep, the mapping is by **family** — foot, wheels,
 * artillery, treads, air, naval — which is how the clips were chosen in the
 * first place (a Sherman for the tank, a rifle for the infantry).
 *
 * Keyed by sprite key, which equals the unit id (ADR-0005), so the same function
 * serves the React controller and the Phaser scene.
 *
 * @see docs/01-specification/assets-inventory.md §7
 */

export interface UnitSounds {
  readonly select: SfxId;
  readonly attack: SfxId;
}

const FAMILIES: Readonly<Record<string, UnitSounds>> = {
  foot: { select: "select_foot", attack: "attack_rifle" },
  mech: { select: "select_foot", attack: "attack_bazooka" },
  wheels: { select: "select_wheels", attack: "attack_recon" },
  artillery: { select: "select_artillery", attack: "attack_cannon" },
  treads: { select: "select_treads", attack: "attack_tank" },
  air: { select: "select_air", attack: "attack_air" },
  naval: { select: "select_naval", attack: "attack_naval" },
};

/** Unit id → family. Anything unlisted falls back to the default pair. */
const UNIT_FAMILY: Readonly<Record<string, keyof typeof FAMILIES>> = {
  infantry: "foot",
  mech: "mech",
  recon: "wheels",
  apc: "wheels",
  artillery: "artillery",
  rockets: "artillery",
  missiles: "artillery",
  tank: "treads",
  medium_tank: "treads",
  neotank: "treads",
  anti_air: "treads",
  fighter: "air",
  bomber: "air",
  battle_copter: "air",
  transport_copter: "air",
  battleship: "naval",
  cruiser: "naval",
  lander: "naval",
  submarine: "naval",
  submarine_submerged: "naval",
};

const DEFAULT: UnitSounds = {
  select: "select_foot",
  attack: "attack_default",
};

export function soundsFor(spriteKey: string): UnitSounds {
  const family = UNIT_FAMILY[spriteKey];
  return family === undefined ? DEFAULT : FAMILIES[family]!;
}
