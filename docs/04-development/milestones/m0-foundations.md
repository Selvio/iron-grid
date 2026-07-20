# Iron Grid — M0 · Workspace, tooling & CI (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Engine, backend, frontend, tooling contributors

> This is the **execution-detail** breakdown of milestone **M0** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the tooling decision is `decisions/0001-frontend-ui-and-tooling-stack.md`;
> the quality bar is `coding-standards.md` §11–§12 and `testing.md` §12.

---

# 1. Purpose

M0 turns the bare Next.js scaffold into the foundation every later milestone
builds on: a **pnpm monorepo** with the `game-engine` and `game-data` packages,
the ADR-0001 tooling (**Vitest**, **husky + lint-staged**), a **formatter**, and
**CI**. No gameplay is built here — this is infrastructure.

**Current scaffold** (starting point): bare Next.js 16 / React 19 app; Node 22 /
pnpm 11 (corepack); `pnpm-workspace.yaml` has only `allowBuilds`; `next.config.ts`
empty; `eslint.config.mjs` is an app-only flat config; no `packages/`, no
`.github/`, no Prettier/Vitest/husky (`architecture.md` §10–§11).

---

# 2. Gates for M0

- **Entry (DoR):** each ticket below is specified with goal, scope, files and
  acceptance — it is Ready. No §33 design blocker touches M0.
- **Exit (DoD):** because M0 is **infrastructure, not a gameplay feature**, the
  Functional Definition of Done (`game-specification.md` §34) is mostly N/A. What
  binds is the **code-change bar** (`coding-standards.md` §11–§12: `tsc`,
  `pnpm lint`, `cspell`) plus each ticket's own acceptance criteria. The
  milestone-level DoD is in §5.

---

# 3. Cross-cutting decisions

- **Package names are unscoped `game-engine` / `game-data`** — matching
  `rules.yaml` → `engine_contract.package_name` and `architecture.md` §4 literally.
  They are private, workspace-only, imported by name (`coding-standards.md` §2).
- **Engine purity is enforced twice:** no forbidden dependency may appear in
  `game-engine`'s `package.json` (guard test, M0-T3) **and** none may be imported
  in its source (`no-restricted-imports` lint rule, M0-T5). The canonical list is
  `rules.yaml` → `engine_contract.forbidden_dependencies`.
- **Formatter:** Prettier (`decisions/0002-code-formatter-prettier.md`, recorded in
  M0-T5).
- **CI provider:** GitHub Actions (repo remote `Selvio/iron-grid`).

---

# 4. Tickets

## M0-T1 · pnpm workspace + shared TS base
- **Goal:** the repo becomes a pnpm workspace with a shared strict TypeScript base.
- **Scope:**
  - Add `packages: ['packages/*']` to `pnpm-workspace.yaml` (keep `allowBuilds`);
    create the `packages/` directory.
  - Pin the toolchain: `.nvmrc` (`22`) and `engines.node` in root `package.json`
    for CI parity.
  - Extract `tsconfig.base.json` with the strict compiler options (no Next
    plugin / `jsx` / `paths`); make root `tsconfig.json` `extends` it (keeping the
    Next plugin, `jsx`, `@/*` alias and app `include`) and add `"packages"` to its
    `exclude` so the app's typecheck doesn't pull package sources.
- **Files:** `pnpm-workspace.yaml`, `.nvmrc`, `tsconfig.base.json`, `tsconfig.json`,
  `package.json`.
- **Acceptance:** `pnpm install` succeeds; the root app still runs `pnpm dev` and
  `pnpm build`.
- **Dependencies:** none (first ticket).

## M0-T2 · `game-data` package skeleton
- **Goal:** an empty, typed package that will host the M1 data loader.
- **Scope:**
  - `packages/game-data/package.json` — private, name `game-data`; dependencies
    `zod`, `js-yaml` (+ `@types/js-yaml`); may depend on `game-engine` types.
  - `packages/game-data/tsconfig.json` extends `tsconfig.base.json`; add a
    `typecheck` script.
  - `packages/game-data/src/index.ts` — placeholder export.
  - Wire into the app: `"game-data": "workspace:*"` in root `package.json`, and add
    `game-data` to `transpilePackages` in `next.config.ts`.
- **Files:** `packages/game-data/**`, root `package.json`, `next.config.ts`.
- **Acceptance:** the package typechecks; `import { … } from 'game-data'` resolves
  from the app; the package has **no framework dependencies**. (Schemas and loader
  are M1, not here.)
- **Dependencies:** M0-T1.

## M0-T3 · `game-engine` package skeleton + forbidden-deps guard
- **Goal:** a pure package skeleton whose framework dependencies are physically
  impossible.
- **Scope:**
  - `packages/game-engine/package.json` — private, name `game-engine`, **no**
    framework dependencies (TypeScript standard library only).
  - `packages/game-engine/tsconfig.json` extends the base; add `typecheck`.
  - `packages/game-engine/src/index.ts` — placeholder export.
  - A **guard test** (Vitest) that reads the package's own `package.json` and
    asserts none of `rules.yaml` → `engine_contract.forbidden_dependencies` appears
    in its dependencies.
  - Wire into the app (`workspace:*` + `transpilePackages`).
- **Files:** `packages/game-engine/**`, root `package.json`, `next.config.ts`.
- **Acceptance:** typechecks; the guard test passes; importable from the app. (The
  nine engine functions land in M2–M3.)
- **Dependencies:** M0-T1.

## M0-T4 · Vitest harness
- **Goal:** a hermetic, deterministic test runner across the packages
  (`testing.md` §12).
- **Scope:**
  - Install `vitest` (root devDependency).
  - Root `vitest.config.ts`: Node environment, TS + ESM native, workspace projects
    for `game-engine` and `game-data`.
  - Scripts: `test` (`vitest`) and `test:run` (`vitest run`).
  - A smoke test per package proving the harness runs.
- **Files:** `vitest.config.ts`, `packages/*/src/*.test.ts`, root `package.json`.
- **Acceptance:** `pnpm test:run` passes and executes tests per package.
- **Dependencies:** M0-T2, M0-T3.

## M0-T5 · Lint, format & spell coverage (monorepo) + ADR-0002
- **Goal:** ESLint, Prettier and cspell cover the app **and** the packages.
- **Scope:**
  - Extend `eslint.config.mjs` to lint `packages/**` with a non-Next TypeScript
    config slice, so React/Next rules don't error on the pure packages.
  - Add a `no-restricted-imports` rule scoped to `packages/game-engine` blocking the
    forbidden dependencies (mirrors the M0-T3 guard, at the source level).
  - Install `prettier` + `eslint-config-prettier`; add `.prettierrc` and
    `.prettierignore`.
  - Install `cspell` as a devDependency.
  - Scripts: `format` (`prettier --write` / `--check`), `spell` (`cspell`), and a
    workspace-wide `typecheck` (`tsc --noEmit` for the app + `pnpm -r --if-present
    typecheck`).
  - **Record `decisions/0002-code-formatter-prettier.md`** (Accepted) and add its
    row to `decisions/README.md`.
- **Files:** `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, root
  `package.json`, `decisions/0002-code-formatter-prettier.md`, `decisions/README.md`.
- **Acceptance:** `pnpm lint`, `pnpm format --check`, `pnpm spell` and `pnpm typecheck`
  all pass across app + packages; a forbidden import in `game-engine` fails lint.
- **Dependencies:** M0-T2, M0-T3.

## M0-T6 · Precommit hooks (husky + lint-staged)
- **Goal:** a fast staged-file gate before every commit — a convenience mirroring
  the CI gate, never a replacement (ADR-0001; `testing.md` §12).
- **Scope:**
  - Install `husky` + `lint-staged`; `husky init` → `.husky/pre-commit`.
  - lint-staged config: staged `*.{ts,tsx}` → `eslint --fix` + `prettier --write`;
    staged `*.{md,ts,tsx,json,yaml}` → `cspell`; run the affected package's
    `tsc --noEmit`.
  - Keep it **fast** — do **not** run the full Vitest suite on precommit; staged
    TypeScript may run `vitest related` only.
- **Files:** `.husky/pre-commit`, root `package.json` (`lint-staged`),
  `.lintstagedrc`.
- **Acceptance:** committing a staged file with a lint or spelling error is blocked
  quickly; a clean commit passes.
- **Dependencies:** M0-T5.

## M0-T7 · CI pipeline (GitHub Actions)
- **Goal:** enforce the full gate on every pull request and merge to `main`.
- **Scope:**
  - `.github/workflows/ci.yml`: enable corepack pnpm, set up Node 22 from `.nvmrc`,
    `pnpm install --frozen-lockfile`, then run in order `pnpm lint` → `pnpm spell` →
    `pnpm typecheck` → `pnpm test:run` → `pnpm build`.
  - Cache the pnpm store.
- **Files:** `.github/workflows/ci.yml`.
- **Acceptance:** the workflow is green on a PR; a deliberate lint/test failure
  blocks the PR.
- **Dependencies:** M0-T4, M0-T5, M0-T6.

**Ordering:** M0-T1 → (M0-T2 ∥ M0-T3) → (M0-T4 ∥ M0-T5) → M0-T6 → M0-T7.

---

# 5. Definition of Done for M0

M0 is complete when, from a clean checkout:

1. `pnpm install` succeeds; `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`,
   `pnpm test:run` and `pnpm build` are all green.
2. `packages/game-engine` and `packages/game-data` exist, are importable from the
   app, and `game-engine` carries no framework dependency.
3. Adding a framework dependency to `game-engine` fails **both** the guard test
   (M0-T3) and the lint rule (M0-T5).
4. The husky pre-commit hook blocks a bad staged file.
5. The GitHub Actions workflow runs the full gate and is required on `main`.

---

# 6. Cross-references

- `roadmap.md` — M0's place in the milestone sequence (§5) and the layered
  strategy (§2).
- `architecture.md` — §4 package boundaries, §10–§11 technology mapping and the
  migration steps this milestone executes.
- `rules.yaml` → `engine_contract` — `package_name`, `forbidden_dependencies`,
  purity (the contract the packages must satisfy).
- `coding-standards.md` — §2 toolchain, §10 JSDoc, §11–§12 the code-change bar.
- `testing.md` — §12 the Vitest requirements and the CI vs precommit split.
- `decisions/0001-frontend-ui-and-tooling-stack.md` — the tooling installed here;
  `decisions/0002-code-formatter-prettier.md` — the formatter (recorded in M0-T5).
- `definition-of-ready.md` — the gate each ticket satisfies.
