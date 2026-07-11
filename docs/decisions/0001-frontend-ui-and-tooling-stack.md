# 0001 — Frontend UI and developer-tooling stack

**Status:** Accepted
**Date:** 2026-07-11
**Resolves blocker:** none (not a `game-specification.md` §33 blocker; this ADR
also settles the open test-runner choice left in `testing.md` §12)
**Deciders:** Selvio Perez (project owner)

## Context

The scaffold fixes the base web stack — Next.js 16 App Router, React 19,
TypeScript `strict`, Tailwind CSS v4 (`architecture.md` §10,
`coding-standards.md` §2) — but leaves several concrete choices open: the UI
component library, the icon set, the form/validation approach on the client, the
test runner (`testing.md` §12 explicitly deferred it), the precommit gate, and
the in-code documentation convention.

These choices must respect two hard constraints already established:

- **Layer boundaries** (`architecture.md` §3–§4): `packages/game-engine` depends
  on the TypeScript standard library only; nothing framework- or UI-specific may
  enter it. UI concerns live in `app/`.
- **The validation boundary is already Zod** (`architecture.md` §6,
  `coding-standards.md` §5): `game-data` and the API edge validate with Zod, so
  the client form layer should reuse that, not introduce a second validation
  mechanism.

## Decision

Adopt the following libraries and tooling:

| Concern | Choice | Scope |
|---|---|---|
| UI components | **shadcn/ui** (Radix + Tailwind v4) | `app/` DOM only — HUD, menus, lobby, forms. **Not** the Phaser canvas. |
| Icons | **lucide-react** | `app/` DOM only (shadcn's default icon set). |
| Client forms | **react-hook-form** + **Zod** via `@hookform/resolvers` | `app/` — match creation, commander selection, ready check, notification preferences, auth. Reuses the existing Zod schemas. |
| Test runner | **Vitest** | All layers (engine, data, backend, frontend), per workspace package. |
| Precommit gate | **husky** + **lint-staged** | Repo level — runs ESLint, cspell, `tsc` and formatting on staged files. |
| In-code docs | **JSDoc / TSDoc** comments | Public/exported APIs across packages. |

**Boundary rules that bind these choices:**

- None of these dependencies may enter `packages/game-engine` (stdlib only,
  `rules.yaml` → `engine_contract`). Zod remains allowed in `packages/game-data`
  and `app/`, never the engine.
- shadcn/ui, lucide-react and react-hook-form are `app/`-only. The Phaser canvas
  is not built from DOM components; shadcn styles the surrounding React DOM
  (`frontend.md` §3).
- husky/lint-staged runs **fast** checks only; the full Vitest suite runs in CI,
  not on precommit (`testing.md` §12, `coding-standards.md` §11).
- JSDoc/TSDoc carries the contract and the *why*; it does not restate TypeScript
  types or duplicate canonical rules (`coding-standards.md` §10).

## Consequences

Positive:

- The four UI libraries compose natively: shadcn's `Form` primitive is built on
  react-hook-form + Zod, and shadcn uses lucide-react by default — one coherent
  UI stack rather than four independent picks.
- Vitest satisfies every requirement `testing.md` §12 set for a runner (hermetic,
  deterministic, TS + ESM native, per-package), so that section is now settled.
- Radix (under shadcn) advances the accessibility baseline of `frontend.md` §10.
- Reusing Zod for client forms keeps a single validation vocabulary from the
  browser through the API edge to `game-data`.

Negative / cost:

- New dependencies and their upgrade surface in `app/`; devDependencies for
  Vitest, husky and lint-staged at the repo root.
- shadcn/ui is copy-in source (components live in the repo), so they are
  maintained by the project, not upgraded via a single package bump.

**Documents updated in this change** (the decision is not "done" until these
match it):

- `coding-standards.md` — §2 toolchain table, §10 JSDoc convention, §11
  husky/lint-staged gate.
- `testing.md` — §12 names Vitest as the runner.
- `frontend.md` — UI-stack section (shadcn/lucide/RHF+Zod) and the DOM-vs-canvas
  boundary.

## Alternatives considered

- **Bare Tailwind components (no shadcn).** More per-component work and weaker
  accessibility defaults; rejected in favor of Radix-backed primitives.
- **A different icon set (e.g. react-icons).** Larger, less consistent; lucide is
  shadcn's native default.
- **Native form state / a different form lib (Formik).** Would not reuse the
  existing Zod schemas as cleanly; react-hook-form + `@hookform/resolvers` does.
- **Jest as the test runner.** Heavier ESM/TS setup than Vitest for this
  workspace; rejected against `testing.md` §12's requirements.
