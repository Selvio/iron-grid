/**
 * The game-data loader.
 *
 * `loadGameData()` reads the eight canonical `docs/02-data/*.yaml`, parses them,
 * stamps the shared version, and returns a `GameData` object — or throws a
 * `GameDataError`. This is the M1-T1 scaffold: it wires reading and version
 * stamping. Zod schema validation (M1-T2..T4) and cross-file integrity checks
 * (M1-T5) attach at the marked seam, after parsing and before returning.
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T1)
 * @see docs/03-architecture/architecture.md §6 (game-data pipeline)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { load as parseYaml } from "js-yaml";

import { DATA_FILES, type DataFileName, type GameData } from "./game-data";
import { GameDataError, type GameDataIssue } from "./errors";
import { resolveDataDir } from "./paths";
import { parseUnits } from "./schemas/units";
import { parseWeapons } from "./schemas/weapons";
import { parseDamageChart } from "./schemas/damage-chart";
import { parseTerrain } from "./schemas/terrain";
import { parseProperties } from "./schemas/properties";
import { parseCommanders } from "./schemas/commanders";
import { parseMaps } from "./schemas/maps";

/** A parsed data file: the loader only assumes a top-level mapping at this stage. */
type RawDocument = Record<string, unknown>;

/** Read and YAML-parse one canonical file into a top-level mapping. */
function readDocument(dataDir: string, name: DataFileName): RawDocument {
  const file = `${name}.yaml`;
  const absolute = join(dataDir, file);

  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (cause) {
    throw new GameDataError({
      file,
      path: null,
      reason: `cannot read data file (${(cause as Error).message})`,
    });
  }

  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (cause) {
    throw new GameDataError({
      file,
      path: null,
      reason: `invalid YAML (${(cause as Error).message})`,
    });
  }

  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  ) {
    throw new GameDataError({
      file,
      path: null,
      reason: "expected a top-level mapping",
    });
  }
  return document as RawDocument;
}

/**
 * Derive the single data-set version from every file's `schema_version`.
 *
 * Every file must declare a non-empty string `schema_version` and they must all
 * agree; a match pins this one value (`game-specification.md` §31.2). Both a
 * missing/non-string version and a disagreement are aggregated so a data author
 * sees the full picture.
 */
function resolveVersion(
  raw: Readonly<Record<DataFileName, RawDocument>>,
): string {
  const issues: GameDataIssue[] = [];
  const byVersion = new Map<string, DataFileName[]>();

  for (const name of DATA_FILES) {
    const value = raw[name].schema_version;
    if (typeof value !== "string" || value.length === 0) {
      issues.push({
        file: `${name}.yaml`,
        path: "schema_version",
        reason: "missing or non-string schema_version",
      });
      continue;
    }
    const files = byVersion.get(value) ?? [];
    files.push(name);
    byVersion.set(value, files);
  }

  if (byVersion.size > 1) {
    const detail = [...byVersion.entries()]
      .map(([version, files]) => `${version} (${files.join(", ")})`)
      .join("; ");
    issues.push({
      file: null,
      path: "schema_version",
      reason: `data files disagree on schema_version: ${detail}`,
    });
  }

  if (issues.length > 0) throw new GameDataError(issues);

  // Exactly one distinct version remains once there are no issues.
  return [...byVersion.keys()][0];
}

/**
 * Load, validate and version-stamp the canonical game data.
 *
 * @returns the typed, versioned {@link GameData}
 * @throws {GameDataError} on any read, parse, schema or integrity failure
 */
export function loadGameData(): GameData {
  const dataDir = resolveDataDir();

  const raw = {} as Record<DataFileName, RawDocument>;
  for (const name of DATA_FILES) {
    raw[name] = readDocument(dataDir, name);
  }

  const version = resolveVersion(raw);

  // Per-file schema + intra-file validation (M1-T2..T4). Cross-file integrity
  // (M1-T5) attaches here, narrowing the remaining `unknown` payload (rules).
  return {
    version,
    units: parseUnits(raw.units),
    weapons: parseWeapons(raw.weapons),
    damageChart: parseDamageChart(raw["damage-chart"]),
    terrain: parseTerrain(raw.terrain),
    properties: parseProperties(raw.properties),
    commanders: parseCommanders(raw.commanders),
    maps: parseMaps(raw.maps),
    rules: raw.rules,
  };
}
