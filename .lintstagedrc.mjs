/**
 * Fast pre-commit checks over *staged* files (M0-T6).
 *
 * Deliberately fast: the full Vitest suite and `next build` run in CI (M0-T7),
 * never here. cspell is scoped to Markdown (matching the `spell` script) to avoid
 * false positives on code identifiers.
 *
 * @see docs/decisions/0001-frontend-ui-and-tooling-stack.md
 * @see docs/04-development/milestones/m0-foundations.md (M0-T6)
 */
export default {
  // Lint + format staged TypeScript, then type-check the whole workspace once
  // (the trailing function runs with no file arguments).
  "*.{ts,tsx}": ["eslint --fix", "prettier --write", () => "pnpm typecheck"],
  // Format staged config/data files.
  "*.{json,yaml,yml}": "prettier --write",
  // Format (where not ignored) and spell-check staged Markdown.
  "*.md": ["prettier --write", "cspell --no-progress --no-must-find-files"],
};
