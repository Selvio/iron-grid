/**
 * The `GameData` shape and the canonical file manifest.
 *
 * `GameData` is the typed, versioned object the engine receives on every call
 * (`architecture.md` §6). Per-file payloads are narrowed as each file's schema
 * ticket lands: units/weapons/damage-chart are typed (M1-T2); terrain/properties
 * (M1-T3) and commanders/maps (M1-T4) remain `unknown` until then.
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1)
 * @see docs/01-specification/game-specification.md §31 (structured data files)
 */

import type { Units } from "./schemas/units";
import type { Weapons } from "./schemas/weapons";
import type { DamageChart } from "./schemas/damage-chart";

/**
 * The eight canonical data files (`game-specification.md` §31), in a stable
 * load order. Names are the YAML file names without the `.yaml` extension.
 */
export const DATA_FILES = [
  "units",
  "weapons",
  "damage-chart",
  "terrain",
  "properties",
  "commanders",
  "maps",
  "rules",
] as const;

/** One of the eight canonical data-file names (without extension). */
export type DataFileName = (typeof DATA_FILES)[number];

/**
 * The typed, versioned game data consumed by the engine.
 *
 * `version` is the shared `schema_version` stamped across the data set and is
 * what an active match pins so a later balance change cannot silently mutate it
 * (`game-specification.md` §31.2). The remaining fields are the parsed contents
 * of each canonical file; they are `unknown` until their schema ticket types them.
 */
export interface GameData {
  /** Shared data-set `schema_version`, pinned per match (`game-spec` §31.2). */
  readonly version: string;
  /** Validated `units.yaml`, keyed by unit ID. */
  readonly units: Units;
  /** Validated `weapons.yaml`, keyed by weapon ID. */
  readonly weapons: Weapons;
  /** Validated `damage-chart.yaml` matrix. */
  readonly damageChart: DamageChart;
  /** Parsed `terrain.yaml` (typed in M1-T3). */
  readonly terrain: unknown;
  /** Parsed `properties.yaml` (typed in M1-T3). */
  readonly properties: unknown;
  /** Parsed `commanders.yaml` (typed in M1-T4). */
  readonly commanders: unknown;
  /** Parsed `maps.yaml` (typed in M1-T4). */
  readonly maps: unknown;
  /** Parsed `rules.yaml` (typed in a later ticket). */
  readonly rules: unknown;
}
