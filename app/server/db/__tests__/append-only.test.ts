import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: the authoritative event store is append-only (`database.md` §7,
 * `security_rules`). No application code may UPDATE or DELETE the `events` or
 * `player_events` tables — only INSERT. This scans the db layer's source for a
 * Drizzle mutation of either table, mirroring the forbidden-import guard.
 *
 * @see docs/03-architecture/database.md §7
 * @see docs/04-development/milestones/m4-persistence.md (M4-T5)
 */
const FORBIDDEN_PATTERNS = [
  /\.update\(\s*events\b/,
  /\.delete\(\s*events\b/,
  /\.update\(\s*playerEvents\b/,
  /\.delete\(\s*playerEvents\b/,
];

const dbRoot = fileURLToPath(new URL("../", import.meta.url));

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

describe("event store append-only enforcement", () => {
  it("has no UPDATE or DELETE of the event tables", () => {
    const offenders: string[] = [];
    for (const file of typeScriptFiles(dbRoot)) {
      // Skip this guard's own source, which names the patterns.
      if (file.endsWith("append-only.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${file} :: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
