import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: the server-only database layer must never be imported by the pure
 * packages — the dependency arrow points backend → engine/data, never the
 * reverse (`architecture.md` §4). Mirrors the engine's forbidden-dependency
 * guard (`packages/game-engine/src/forbidden-deps.test.ts`), enforcing the same
 * boundary from the database side.
 *
 * @see docs/03-architecture/architecture.md §4
 * @see docs/04-development/milestones/m4-persistence.md (M4-T1)
 */
const PURE_PACKAGES = ["game-engine", "game-data"] as const;

/** Any import specifier reaching into the server db module is forbidden. */
const FORBIDDEN_SPECIFIER = /server\/db/;

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function typeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      out.push(...typeScriptFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("database layer boundary", () => {
  it("is never imported by the pure packages", () => {
    const offenders: string[] = [];

    for (const pkg of PURE_PACKAGES) {
      const srcDir = `${repoRoot}packages/${pkg}/src`;
      for (const file of typeScriptFiles(srcDir)) {
        const source = readFileSync(file, "utf8");
        const specifiers =
          source.match(/from\s*["']([^"']+)["']/g) ?? ([] as readonly string[]);
        for (const clause of specifiers) {
          const specifier = clause.match(/["']([^"']+)["']/)?.[1] ?? "";
          if (FORBIDDEN_SPECIFIER.test(specifier)) {
            offenders.push(`${file} → ${specifier}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
