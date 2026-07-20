# Iron Grid — Coding Standards

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Backend, frontend, engine, data, QA, AI contributors

> This document defines *how code is written* in Iron Grid: language settings,
> naming, module boundaries, error handling, async style and formatting. It is
> the conventions layer that sits underneath every implementation task.
>
> It **references** rather than restates the architectural laws. Package
> boundaries and forbidden dependencies are canonical in `architecture.md` §4
> and `rules.yaml` → `engine_contract`; the engine contract is canonical in
> `rules.yaml`; domain entity shapes are canonical in `domain-model.md`. This
> document must never redefine them — it only says how to express them in code.

---

# 1. Purpose and scope

This document answers: *when I write a line of Iron Grid code, what does it have
to look like, and what is it not allowed to do?*

It covers:

- The canonical language, package manager and toolchain settings.
- Naming and file organization across the four layers.
- Type-safety rules and the boundary where untyped data becomes typed.
- How the engine's purity is expressed in code.
- Error handling, async and immutability conventions.
- Comments, formatting and linting.

It does **not** cover:

- Which layer may depend on which → `architecture.md` §3–§4.
- The engine's public API → `rules.yaml` → `engine_contract` and
  `architecture.md` §5.
- Test strategy and coverage → `testing.md`.
- Milestone order → `roadmap.md`.

---

# 2. Toolchain baseline

The scaffold-present settings are fixed and must not drift per package. The
"decided" rows are chosen in `decisions/0001-frontend-ui-and-tooling-stack.md`
but not yet installed (a code-phase task, like the runtime deps in
`architecture.md` §10).

| Setting | Value | Source |
|---|---|---|
| Language | TypeScript (`strict: true`) | `tsconfig.json` |
| Package manager | pnpm (workspace) | `package.json` → `packageManager`, `pnpm-workspace.yaml` |
| Module system | ES modules (`"module": "esnext"`, `"moduleResolution": "bundler"`) | `tsconfig.json` |
| Linter | ESLint 9 flat config (`eslint.config.mjs`), `eslint-config-next` | root config |
| Runtime (web) | Next.js 16 App Router, React 19 | `package.json` |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | `package.json`, `postcss.config.mjs` |
| Spell check | `cspell` (`cspell.json`) | root config |
| UI components | shadcn/ui (Radix + Tailwind) — `app/` DOM only | ADR-0001 (to install) |
| Icons | lucide-react — `app/` DOM only | ADR-0001 (to install) |
| Client forms | react-hook-form + Zod (`@hookform/resolvers`) — `app/` | ADR-0001 (to install) |
| Test runner | Vitest (all packages) | ADR-0001 (to install) |
| Precommit | husky + lint-staged | ADR-0001 (to install) |

**Rules:**

- `strict` mode is non-negotiable and applies to every workspace package. New
  packages inherit the root `tsconfig.json` settings; they do not relax them.
- Dependencies are added with `pnpm add` and cross-package references use the
  `workspace:*` protocol (`architecture.md` §11). Never hand-edit `pnpm-lock.yaml`.
- The root path alias `@/*` maps to the app root (`tsconfig.json` → `paths`).
  Engine and data packages are imported by their package name, not by a relative
  path into `packages/`.

---

# 3. Layer-aware module rules

The four layers of `architecture.md` §3 impose hard import rules. The linter and
package boundaries enforce them; code must not attempt to circumvent them.

| Writing code in… | May import | Must never import |
|---|---|---|
| `packages/game-engine` | TypeScript standard library only (it **owns** the shared `GameData` type and receives the data as an argument) | The framework deps in `rules.yaml` → `engine_contract.forbidden_dependencies` (`next`, `react`, `phaser`, `drizzle-orm`, `pg`, `@neondatabase/serverless`, `resend`, `@auth/core`); plus any I/O and **`game-data`** itself (`architecture.md` §3, §5; `engine_contract.purity.external_io: false`) |
| `packages/game-data` | `zod`, a YAML parser, `game-engine` types | Framework/runtime deps of app (`next`, `react`, `phaser`, `drizzle-orm`, `resend`, `@auth/core`) |
| `app/` (backend + frontend) | The full stack, plus both packages via `workspace:*` | — (but app code may **never** be imported *by* the packages) |

**The single most important rule:** nothing points *into* the engine except
`GameData`. If an engine file needs the database, the clock, the network or a
random number, the design is wrong — pass the result in as an argument instead
(`architecture.md` §5, §8).

---

# 4. Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Files — engine/data/lib modules | `kebab-case.ts` | `calculate-visibility.ts` |
| Files — React components | `PascalCase.tsx` | `MatchBoard.tsx` |
| Files — Next.js route handlers / special files | framework-mandated | `route.ts`, `page.tsx`, `layout.tsx` |
| Types, interfaces, enums | `PascalCase` | `PlayerView`, `ValidationResult` |
| Functions, variables | `camelCase` | `validateAction`, `stateVersion` |
| Constants (module-level, fixed) | `UPPER_SNAKE_CASE` | `MAX_TURN_DEADLINE_HOURS` |
| Engine public functions | exactly as in `rules.yaml` → `engine_contract.required_public_functions` | `applyAction`, `projectStateForPlayer` |

**Domain terms follow `domain-model.md` verbatim.** An entity called `MatchPlayer`
in the domain model is `MatchPlayer` in code — not `Participant`, not `Player2`.
Field names mirror the canonical entity fields (`stateVersion`,
`expectedStateVersion`, `idempotencyKey`, `randomSeed`) so that engine, backend
and database read the same word for the same thing.

**Never encode game-data values in identifiers.** Because the engine is
data-driven (`project-manifest.md` → Data-Driven Engine), there are no
`infantry`, `tank` or `orangeStar` symbols in engine logic. Unit, terrain and
commander identities are *data*, looked up from `GameData`, never `if` branches
on hardcoded names.

---

# 5. Type safety and the validation boundary

`strict` TypeScript is the floor, not the ceiling.

- **No `any`.** Prefer precise types; use `unknown` at true boundaries and narrow
  before use. A genuinely required escape hatch carries a one-line comment
  explaining why.
- **Types over enums of magic strings.** Discriminated unions model the
  `Action` envelope (`Action.type`, `backend.md` §3) and event variants; the
  discriminant makes the pipeline exhaustive-checkable.
- **Exhaustiveness.** `switch` over a discriminated union ends in a `never`
  default so an unhandled action or event type fails at compile time.
- **The validation boundary is `game-data` and the API edge.** Untyped YAML and
  untyped request payloads become typed exactly once, via Zod, at the edge:
  - `game-data` Zod-validates `docs/02-data/*.yaml` into a typed, versioned
    `GameData` at build time (`architecture.md` §6).
  - The backend Zod-validates every inbound action payload
    (`validate_action_payload_schema`, `backend.md` §4) before the engine sees it.
  Downstream of these gates, code trusts the types. The engine never re-parses
  raw input; it receives already-typed `state`, `action` and `gameData`.

---

# 6. Engine purity in code

The purity and determinism contract is canonical in `rules.yaml` →
`engine_contract`. In code it is expressed as:

- **Pure functions only.** Engine functions are `(inputs) => outputs`. No
  mutation of arguments, no module-level mutable state, no side effects.
- **State is immutable.** `applyAction` returns a new `nextState`; it never edits
  the `state` it was given. Treat inputs as `readonly`.
- **No ambient nondeterminism.** No `Date.now()`, no `Math.random()`, no
  `crypto` calls, no `process.env`, no I/O anywhere in `packages/game-engine`.
  Randomness arrives only through the injected `randomSource`
  (`architecture.md` §8); time arrives only as data on the incoming state/action.
- **Return, don't emit.** Engine functions return `events`; they do not log,
  throw for control flow, or write anywhere.

The backend is the *only* place the clock and RNG enter the system
(`backend.md` §5). If you find yourself wanting either inside the engine, move
the value to the call site and pass it in.

---

# 7. Error handling

- **Validation results are values, not exceptions.** `validateAction` returns a
  `ValidationResult` describing legality; illegal-but-expected outcomes (stale
  version, illegal move, wrong active player) are typed results the caller
  branches on — not thrown errors (`backend.md` §4, §8).
- **Exceptions are for the genuinely exceptional** — programmer error, a broken
  invariant, a failed transaction. They are not used to signal ordinary rejected
  actions.
- **Typed failure codes at the API boundary.** Concurrency and claim-victory
  failures use the exact codes fixed by `rules.yaml` (`stale_state_version`,
  `deadline_not_expired`, `victory_claim_unavailable`, `match_already_completed`,
  `backend.md` §8–§9). Do not invent new strings for these.
- **Never leak hidden state in errors or logs.** Error payloads and logs are
  redacted per `security_rules` (`backend.md` §12); a conflict response carries
  the safe `stateVersion` and nothing hidden.
- **Transactions are all-or-nothing.** A failed mutation consumes no random
  sequence, ammo or funds and does not change `stateVersion`
  (`action_processing.failure`, `backend.md` §4). Partial commits are forbidden.

---

# 8. Async, concurrency and side effects

- **Async only where I/O lives** — the backend (database, Resend, Auth.js). The
  engine and data-transformation code are synchronous and pure.
- **`async`/`await` over raw promise chains.** Every `await` on I/O sits inside
  the transactional pipeline or a clearly-scoped handler.
- **Server mutations run on the Node.js runtime, not Edge** (`backend.md` §2):
  they need transactions and row locks. Do not mark a mutation route `edge`.
- **Idempotency and concurrency are pipeline concerns, expressed explicitly** —
  every mutation carries `idempotencyKey` and `expectedStateVersion`
  (`backend.md` §4, §8); handlers thread them through rather than re-deriving them.

---

# 9. Frontend conventions

Detailed rendering/interaction design is in `frontend.md`; the coding rules are:

- **The client is never authoritative.** Any preview the UI computes for
  responsiveness (movement range, combat preview) is non-authoritative and is
  re-checked by the server (`architecture.md` §9). Client code must not treat its
  own simulation as truth.
- **Phaser renders only the filtered view it receives.** Rendering code never
  hides information and never holds hidden state — the server already projected
  it (`architecture.md` §9). No fog-of-war logic lives in the client.
- **React components are typed and prop-driven.** Component files are
  `PascalCase.tsx`; props are explicit typed interfaces; server-only concerns
  (secrets, DB, engine invocation) never cross into client components.
- **Styling and UI** use Tailwind CSS v4 with **shadcn/ui** components and
  **lucide-react** icons (ADR-0001). These are DOM-only: shadcn styles the React
  UI around the board (HUD, menus, lobby, forms); the **Phaser canvas is not
  built from DOM components** (`frontend.md` §3).
- **Forms use react-hook-form + Zod** via `@hookform/resolvers` (ADR-0001),
  reusing the same Zod schemas as the validation boundary (§5). Client validation
  is UX only — the server re-validates every submission (`backend.md` §4).

---

# 10. Comments and documentation

Consistent with the project motto — *documentation is the product; code is the
implementation* (`project-manifest.md`):

- **Comments explain *why*, not *what*.** The code says what it does; a comment
  earns its place by capturing a non-obvious reason, invariant or reference.
- **Cite the canonical source for a rule, don't restate it.** When code
  implements a documented rule, reference it (`// per rules.yaml →
  timeout_claim_rules`) rather than paraphrasing the rule inline, so there is one
  source of truth (`master-index.md` → Rules).
- **No dead code, no commented-out blocks.** Delete it; git remembers.
- **Public/exported APIs carry JSDoc/TSDoc** (ADR-0001). Every exported function,
  type and module boundary gets a doc comment stating its contract and intent —
  not a restatement of its TypeScript types. **Public engine functions**
  additionally point at `rules.yaml` → `engine_contract`. JSDoc complements the
  canonical docs; it never becomes a second source of truth for a rule.

---

# 11. Formatting and linting

- **ESLint is the gate.** `pnpm lint` must pass with no errors before a change is
  considered done. The flat config (`eslint.config.mjs`) extending
  `eslint-config-next` is authoritative; do not disable rules file-wide to force
  a pass — fix the code or justify a narrowly-scoped inline disable.
- **`cspell` must pass.** New domain terms are added to `cspell.json`, not
  silenced ad hoc.
- **TypeScript must compile with no errors** under `strict`. `tsc`/`next build`
  type errors block a change.
- **Consistent formatting** across the codebase; a formatter's output is not
  hand-edited. Whitespace-only churn is kept out of substantive diffs.
- **Precommit gate: husky + lint-staged** (ADR-0001) runs the fast checks
  (ESLint, cspell, `tsc`, formatting, and `vitest related` for staged
  TypeScript) over **staged files** before a commit. It stays fast: the full
  Vitest suite runs in CI (`testing.md` §12), not on precommit. The hook is a
  convenience that mirrors the gate — it never replaces the CI gate.

---

# 12. Definition of done for a code change

A change is complete only when all hold:

1. It satisfies the documented behavior it implements — no invented behavior
   (`project-manifest.md` → AI Development Rules).
2. It respects the layer import rules of §3 (engine stays pure and framework-free).
3. Domain terms match `domain-model.md`; no hardcoded game-data identities (§4).
4. `tsc`/`next build`, `pnpm lint` and `cspell` all pass (§11).
5. Tests required by `testing.md` pass.
6. Documentation was updated first where behavior changed
   (`project-manifest.md` → Documentation Before Code).

---

# 13. Cross-references

- `architecture.md` — §3–§4 layers and package boundaries, §5 engine, §8
  determinism, §9 information security, §11 migration.
- `domain-model.md` — canonical entity and field names used verbatim in code.
- `backend.md` — §2 runtime, §4 action pipeline, §5 determinism, §8–§9
  concurrency and claim victory, §12 security.
- `frontend.md` — React/Phaser rendering and interaction detail.
- `rules.yaml` → `engine_contract` — required public functions, purity,
  forbidden dependencies.
- `testing.md` — how these standards are verified.
- `project-manifest.md` — principles, technology stack, AI development rules.
