import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: the server-only layers must never be imported by the pure packages —
 * the dependency arrow points backend → engine/data, never the reverse
 * (`architecture.md` §4). Mirrors the engine's forbidden-dependency guard
 * (`packages/game-engine/src/forbidden-deps.test.ts`), enforcing the same
 * boundary from the server side. Covers the database layer (`server/db`, M4-T1),
 * the auth layer (`server/auth`, M5-T1) and the account layer (`server/account`,
 * M5-T5).
 *
 * @see docs/03-architecture/architecture.md §4
 * @see docs/04-development/milestones/m4-persistence.md (M4-T1)
 * @see docs/04-development/milestones/m5-auth.md (M5-T1, T5)
 */
const PURE_PACKAGES = ["game-engine", "game-data"] as const;

/** Any import specifier reaching into a server-only module is forbidden. */
const FORBIDDEN_SPECIFIER = /server\/(db|auth|account)/;

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

describe("server layer boundary", () => {
  it("db and auth layers are never imported by the pure packages", () => {
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
