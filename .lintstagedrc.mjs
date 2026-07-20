/**
 * Fast pre-commit checks over *staged* files (M0-T6).
 *
 * Deliberately fast: the full Vitest suite and `next build` run in CI (M0-T7),
 * never here. Staged `*.{ts,tsx}` do run `vitest related` so a component /
 * module change cannot land without its linked tests. cspell is scoped to
 * Markdown (matching the `spell` script) to avoid false positives on code
 * identifiers.
 *
 * @see docs/decisions/0001-frontend-ui-and-tooling-stack.md
 * @see docs/04-development/milestones/m0-foundations.md (M0-T6)
 */

/**
 * Quote a path for a POSIX shell (lint-staged runs commands via `sh -c`).
 *
 * @param {string} file
 */
function shellQuote(file) {
  return `'${file.replaceAll("'", `'\\''`)}'`;
}

/**
 * Run only the tests that import (or are) the staged TypeScript files.
 * `--passWithNoTests` keeps the gate green when a leaf file has no suite yet.
 *
 * @param {string[]} filenames
 */
function relatedTests(filenames) {
  if (filenames.length === 0) return [];
  return [
    `pnpm exec vitest related --run --passWithNoTests ${filenames.map(shellQuote).join(" ")}`,
  ];
}

export default {
  // Lint + format staged TypeScript, type-check once, then run related tests.
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write",
    () => "pnpm typecheck",
    relatedTests,
  ],
  // Format staged config/data files.
  "*.{json,yaml,yml}": "prettier --write",
  // Format (where not ignored) and spell-check staged Markdown.
  "*.md": ["prettier --write", "cspell --no-progress --no-must-find-files"],
};
