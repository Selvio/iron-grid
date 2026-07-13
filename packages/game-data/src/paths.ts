/**
 * Locating the canonical data directory.
 *
 * The `game-data` package **reads** `docs/02-data/*.yaml`; it never copies the
 * values into TypeScript (`architecture.md` §6). The directory therefore has to
 * be resolved on disk at load time. Validation runs at build/test time in Node,
 * so walking up from this module to the repository root is sufficient and robust
 * to whichever workspace package invokes the loader.
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T1)
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GameDataError } from "./errors";

/** Repo-relative location of the canonical YAML, from the repository root. */
const DATA_DIR_RELATIVE = join("docs", "02-data");

/**
 * Resolve the absolute path of `docs/02-data` by walking up the directory tree
 * from this module until an ancestor is found that owns it.
 *
 * @returns absolute path to the canonical `docs/02-data` directory
 * @throws {GameDataError} when no ancestor directory contains `docs/02-data`
 */
export function resolveDataDir(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (;;) {
    const candidate = join(dir, DATA_DIR_RELATIVE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  throw new GameDataError({
    file: null,
    path: null,
    reason: `could not locate ${DATA_DIR_RELATIVE} above ${start}`,
  });
}
