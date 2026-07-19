import type { SfxId } from "./sfx";

/**
 * Which sound a unit makes (M12 audio).
 *
 * Transcribed from the source project's renderers (`view/render/units/**`),
 * where each unit carries its own `selected` and `attack` clip. It only voiced
 * ten of them, so the rest are grouped — but along the two axes the original
 * itself used, which are not the same axis:
 *
 * - **Selecting** is the vehicle answering, so it follows the chassis: a Sherman
 *   engine for tracks, tyres for wheels, rotors for air. That is
 *   `units.yaml movement.type`, not a hand-drawn guess — which is how the rocket
 *   launcher (tyres) ended up laughing like a soldier when it was filed under
 *   "artillery".
 * - **Attacking** is the weapon firing, so it follows armament: a cannon for
 *   artillery and rockets, a rifle for infantry, a bazooka for the mech.
 *
 * Keyed by sprite key, which equals the unit id (ADR-0005), so the same function
 * serves the React controller and the Phaser scene.
 *
 * @see docs/01-specification/assets-inventory.md §8
 */

export interface UnitSounds {
  readonly select: SfxId;
  readonly attack: SfxId;
}

/** Chassis → the sound of it moving off, mirroring `units.yaml movement.type`. */
const SELECT_BY_CHASSIS: Readonly<Record<string, SfxId>> = {
  foot: "select_foot",
  mech: "select_foot",
  tires: "select_wheels",
  treads: "select_treads",
  air: "select_air",
  ship: "select_naval",
  transport_ship: "select_naval",
};

const UNIT_CHASSIS: Readonly<Record<string, keyof typeof SELECT_BY_CHASSIS>> = {
  infantry: "foot",
  mech: "mech",
  recon: "tires",
  missiles: "tires",
  rockets: "tires",
  apc: "treads",
  artillery: "treads",
  tank: "treads",
  anti_air: "treads",
  medium_tank: "treads",
  neotank: "treads",
  battle_copter: "air",
  transport_copter: "air",
  fighter: "air",
  bomber: "air",
  lander: "transport_ship",
  cruiser: "ship",
  submarine: "ship",
  submarine_submerged: "ship",
  battleship: "ship",
};

/** Armament → the sound of it firing. Unlisted units use the generic report. */
const ATTACK_BY_UNIT: Readonly<Record<string, SfxId>> = {
  infantry: "attack_rifle",
  mech: "attack_bazooka",
  recon: "attack_recon",
  artillery: "attack_cannon",
  rockets: "attack_cannon",
  missiles: "attack_cannon",
  tank: "attack_tank",
  medium_tank: "attack_tank",
  neotank: "attack_tank",
  anti_air: "attack_tank",
  fighter: "attack_air",
  bomber: "attack_air",
  battle_copter: "attack_air",
  battleship: "attack_naval",
  cruiser: "attack_naval",
  submarine: "attack_naval",
  submarine_submerged: "attack_naval",
};

export function soundsFor(spriteKey: string): UnitSounds {
  const chassis = UNIT_CHASSIS[spriteKey];
  return {
    select: chassis === undefined ? "select_foot" : SELECT_BY_CHASSIS[chassis]!,
    attack: ATTACK_BY_UNIT[spriteKey] ?? "attack_default",
  };
}
