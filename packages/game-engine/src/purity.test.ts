import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: the pure engine's source must reference none of the impurity vectors —
 * wall-clock reads, `Math.random`, process/I-O, or Node built-ins. Combined with
 * the injected `RandomSource` and the forbidden-dependency guard, this is what
 * makes every engine function deterministic and replayable (`engine_contract.
 * purity`, `game-specification.md` §5, `domain-model.md` §15).
 *
 * Comments are stripped before scanning so a doc reference (e.g. "never calls
 * `Math.random`") is not itself a violation — only real code is inspected.
 *
 * @see docs/02-data/rules.yaml → engine_contract.purity
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5)
 */

/** Runtime symbols an impure engine would reach for; each must not appear in code. */
const FORBIDDEN_PATTERNS: readonly {
  readonly name: string;
  readonly re: RegExp;
}[] = [
  { name: "Math.random", re: /\bMath\.random\b/ },
  { name: "Date", re: /\bDate\b/ },
  { name: "process.*", re: /\bprocess\./ },
  { name: "require(", re: /\brequire\s*\(/ },
  { name: "globalThis", re: /\bglobalThis\b/ },
  { name: "setTimeout/setInterval", re: /\bset(?:Timeout|Interval)\b/ },
  { name: 'import "node:*"', re: /from\s+["']node:/ },
];

/** Remove block and line comments so only executable code is inspected. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Every non-test TypeScript source file under the engine's `src` tree, recursing
 * into subdirectories so a future `src/actions/*.ts` cannot slip past the guard.
 */
function engineSourceFiles(
  dir = fileURLToPath(new URL(".", import.meta.url)),
): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) files.push(...engineSourceFiles(`${path}/`));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("game-engine source purity", () => {
  it("references no wall-clock, randomness, process or Node built-in", () => {
    const violations: string[] = [];
    for (const file of engineSourceFiles()) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        if (re.test(code)) violations.push(`${file.split("/").pop()}: ${name}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("actually scans the source files (self-check)", () => {
    // Guard against the glob silently matching nothing.
    expect(engineSourceFiles().length).toBeGreaterThan(5);
  });
});
