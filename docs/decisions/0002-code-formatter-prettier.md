# 0002 — Code formatter: Prettier

**Status:** Accepted
**Date:** 2026-07-11
**Resolves blocker:** none (not a `game-specification.md` §33 blocker; this ADR
names the formatter that ADR-0001 left unspecified)
**Deciders:** Selvio Perez (project owner)

## Context

ADR-0001 adopted husky + lint-staged and required "consistent formatting" per
`coding-standards.md` §11 ("a formatter's output is not hand-edited"), but did not
name a formatter. Milestone M0-T5 wires the precommit hook and CI, which need a
concrete, non-interactive formatter to run over staged files and to enforce in CI.
Accepted ADRs are append-only (`decisions/README.md` §4), so the choice is
recorded here rather than by editing ADR-0001.

## Decision

Use **Prettier** as the single code formatter for the workspace.

- Config: `.prettierrc` (`printWidth` 80, `semi` true, double quotes,
  `trailingComma` "all"); `.prettierignore` excludes build output, the pnpm
  lockfile, `docs/**` (prose + the vendored Claude Design export) and binary
  assets.
- Integration: `eslint-config-prettier` is applied last in `eslint.config.mjs` so
  ESLint stops enforcing formatting rules that would fight Prettier; lint keeps
  code-quality rules only.
- Scripts: `format` (`prettier --write .`) and `format:check`
  (`prettier --check .`). The precommit hook (M0-T6) runs `prettier --write` on
  staged files; CI (M0-T7) runs `format:check`.

## Consequences

Positive:

- One deterministic formatter; formatting is never hand-arbitrated (`coding-standards.md` §11).
- Clean separation of concerns: Prettier formats, ESLint checks code quality.

Negative / cost:

- A one-time reformat of the existing code when Prettier is introduced.
- Markdown under `docs/**` is intentionally **not** Prettier-formatted (it is
  hand-wrapped prose, cspell-checked), so formatting discipline there stays manual.

**Documents updated in this change:** `coding-standards.md` §11 already references
"a formatter"; this ADR names it. `decisions/README.md` index updated.

## Alternatives considered

- **ESLint `--fix` only (no Prettier).** Weaker, less complete formatting coverage
  (no CSS/JSON/consistent wrapping); rejected.
- **Biome / dprint.** Capable all-in-one tools, but Prettier is the de-facto
  standard with the least friction alongside the existing ESLint/Next setup;
  rejected for now.
