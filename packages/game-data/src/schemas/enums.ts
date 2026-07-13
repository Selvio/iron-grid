/**
 * Shared enum vocabularies, mirrored from the `enums:` blocks of the canonical
 * data files (`units.yaml`, `weapons.yaml`). Encoding them as Zod enums gives the
 * engine typed unions instead of magic strings (`coding-standards.md` §5) and
 * makes "no unknown movement type / property category" a schema-level guarantee
 * (`game-specification.md` §31.1).
 *
 * @see docs/02-data/units.yaml (enums)
 * @see docs/02-data/weapons.yaml (enums)
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */

import { z } from "zod";

/** Unit categories (`units.yaml` enums.categories). */
export const unitCategory = z.enum(["ground", "air", "naval"]);

/** Movement types (`units.yaml` enums.movement_types). */
export const movementType = z.enum([
  "foot",
  "mech",
  "tires",
  "treads",
  "air",
  "ship",
  "transport_ship",
]);

/** Combat types (`units.yaml` enums.combat_types). */
export const combatType = z.enum(["none", "direct", "indirect"]);

/** Target domains (`units.yaml` / `weapons.yaml` enums.target_domains). */
export const targetDomain = z.enum([
  "ground",
  "air",
  "naval",
  "submarine",
  "terrain_object",
]);

/** Submarine special states (`units.yaml` enums.special_states). */
export const specialState = z.enum(["surfaced", "submerged"]);

/** Properties that produce units (`units.yaml` enums.production_properties). */
export const productionProperty = z.enum(["base", "airport", "port"]);

/** Properties that repair units (`units.yaml` enums.repair_properties). */
export const repairProperty = z.enum([
  "city",
  "base",
  "airport",
  "port",
  "headquarters",
]);

/** Weapon slots (`weapons.yaml` enums.slots). */
export const weaponSlot = z.enum(["primary", "secondary"]);

/** Weapon fire modes (`weapons.yaml` enums.fire_modes). */
export const fireMode = z.enum(["direct", "indirect"]);

/** Weapon ammo models (`weapons.yaml` enums.ammo_models). */
export const ammoModel = z.enum(["finite_primary_pool", "infinite"]);

/** Terrain groups (`terrain.yaml` enums.terrain_groups). */
export const terrainGroup = z.enum([
  "land",
  "water",
  "structure",
  "property",
  "special",
]);

/** Fog concealment domains (`terrain.yaml` enums.fog_concealment). Air is never concealable. */
export const fogConcealment = z.enum(["none", "ground", "naval"]);

/** Art-pipeline status gating official-map use (`terrain.yaml` / `properties.yaml`). */
export const assetStatus = z.enum([
  "confirmed",
  "mapping_required",
  "derivative_art_required",
  "blocked",
]);

/** Property types (`properties.yaml` enums.property_types). */
export const propertyType = z.enum([
  "city",
  "base",
  "airport",
  "port",
  "headquarters",
]);

/** Production categories (`properties.yaml` enums.production_categories). */
export const productionCategory = z.enum(["none", "ground", "air", "naval"]);

/** Repair categories (`properties.yaml` enums.repair_categories). */
export const repairCategory = z.enum(["ground", "air", "naval"]);

/** Faction IDs (`commanders.yaml` enums.faction_ids). */
export const factionId = z.enum(["blue", "green", "red", "yellow"]);

/** Commander lifecycle statuses (`commanders.yaml` enums.commander_statuses). */
export const commanderStatus = z.enum([
  "draft",
  "approved",
  "disabled",
  "blocked",
]);

/** Map lifecycle statuses (`maps.yaml` enums.map_statuses). */
export const mapStatus = z.enum([
  "draft",
  "review",
  "approved",
  "published",
  "retired",
  "blocked",
]);

/** Property ownership at match start (`maps.yaml` property_instance_schema). */
export const initialOwner = z.enum(["neutral", "player_1", "player_2"]);

/** A player slot ID (`maps.yaml` player_slot_schema). */
export const playerSlotId = z.enum(["player_1", "player_2"]);

export type UnitCategory = z.infer<typeof unitCategory>;
export type PropertyType = z.infer<typeof propertyType>;
export type RepairCategory = z.infer<typeof repairCategory>;
export type PlayerSlotId = z.infer<typeof playerSlotId>;
export type MovementType = z.infer<typeof movementType>;
export type CombatType = z.infer<typeof combatType>;
export type TargetDomain = z.infer<typeof targetDomain>;
export type SpecialState = z.infer<typeof specialState>;
export type WeaponSlot = z.infer<typeof weaponSlot>;
export type FireMode = z.infer<typeof fireMode>;
