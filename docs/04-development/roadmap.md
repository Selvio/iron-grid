# Iron Grid — Roadmap

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** All contributors (human and AI), product

> This document sequences the build: it divides Iron Grid into **milestones**,
> each with a small set of **high-level tasks**. It is deliberately coarse —
> per-task detail is produced when a milestone starts, via the checklist in
> `definition-of-ready.md`, not here.
>
> It **references** rather than restates the canonical sources. What each feature
> *is* lives in `game-specification.md`; how the layers fit is in
> `architecture.md`; the technology is in `project-manifest.md`; the gates are in
> `definition-of-ready.md` and `game-specification.md` §34 / `testing.md`. This
> document only orders the work and must not redefine any of them.

---

# 1. Purpose and how to use this

This roadmap answers: *in what order do we build Iron Grid, and what belongs to
each milestone?*

- Milestones are **coarse units of delivery**, grouped into phases by dependency.
- The task lists are **high-level**, not exhaustive. When a milestone begins, each
  task is expanded into implementation-ready work only if it passes the Definition
  of Ready (`definition-of-ready.md`).
- A milestone is **done** only when every one of its features clears the exit
  gate (§3). Milestones are not "done" on a best-effort basis.

It does **not** cover: gameplay behavior (`game-specification.md`), architecture
(`architecture.md`), or the per-task quality bar (`definition-of-ready.md`,
`testing.md`).

---

# 2. Build strategy

- **Layered, dependency-ordered** (`architecture.md` §3, §11). Work proceeds
  `game-data → game-engine → backend → frontend`. The pure engine is built and
  unit-tested **offline** before the server drives it; nothing outer is built on an
  incomplete inner layer.
- **Just-in-time design blockers.** Each open blocker in `game-specification.md`
  §33 is resolved by an **Accepted ADR** (`decisions/README.md`) as the *first
  task of the milestone that needs it* — not batched up front or deferred wholesale
  to the end. Data-driven mechanisms are built first with placeholder data
  (`game-specification.md` §22.4); concrete values and art land when the ADR is
  accepted. The blocker→milestone map is §5.

---

# 3. Cross-cutting rules (bind every milestone task)

These hold for **every** task in every milestone; they are not repeated per task.

- **Entry gate — Definition of Ready** (`definition-of-ready.md`): no task starts
  until its behavior is specified, its data exists and validates, no open §33
  blocker applies, and its acceptance is identifiable.
- **Exit gate — Functional Definition of Done** (`game-specification.md` §34,
  `testing.md` §11) **plus** the code-change bar (`coding-standards.md` §11–§12:
  `tsc`/`next build`, `pnpm lint`, `cspell`). A feature is done only when both hold.
- **Data-driven, always** (`project-manifest.md`; `game-specification.md` §22.4):
  no hardcoded unit/terrain/commander names in engine logic.
- **Engine stays pure and framework-free** (`architecture.md` §4, `rules.yaml` →
  `engine_contract`): the forbidden dependencies are physically absent from its
  package.
- **Test depth is focused** (`testing.md` §2): anchor to the §35 acceptance
  scenarios and `required_validation_tests`; do not chase coverage.

---

# 4. Starting point

The repository is a bare Next.js 16 / React 19 app (`architecture.md` §10–§11):
no `packages/` workspace directory, and no Drizzle, Auth.js, Resend, Phaser,
Vitest, shadcn/ui, react-hook-form, husky or lint-staged installed yet. The
canonical `docs/02-data/*.yaml` and the `game-assets/` art are present. Everything
marked "To add" in `architecture.md` §10 is created across the milestones below;
the ADR-0001 tooling is installed in M0.

---

# 5. Milestones

Thirteen milestones (M0–M12) in five phases.

## Phase 0 — Foundations

### M0 · Workspace, tooling & CI
- Convert to a pnpm workspace: add `packages: ['packages/*']`
  (`architecture.md` §11 steps 1–4).
- Create `packages/game-engine` (own `package.json`, **no framework deps**) and
  `packages/game-data`; reference both from the root app via `workspace:*`.
- Install and wire the ADR-0001 tooling: **Vitest** (+ a `test` script), **husky +
  lint-staged** precommit, JSDoc/TSDoc convention
  (`decisions/0001-frontend-ui-and-tooling-stack.md`, `testing.md` §12).
- Stand up **CI**: Vitest suite + `tsc`/`next build` + `pnpm lint` + `cspell` on
  merge (`coding-standards.md` §11, `testing.md` §12).

### M1 · Game-data pipeline & validation
- Zod schemas for every `docs/02-data/*.yaml`; loader → typed, versioned
  `GameData` (`architecture.md` §6).
- Build-time validation checks (`game-specification.md` §31.1: schema, unique IDs,
  cross-references, complete damage coverage, movement types, property categories,
  sprite-row mapping, map dimensions, two starts, HQ ownership, no disabled units,
  no blocked terrain).
- Data-validation tests (`testing.md` §4); a validation failure is a build failure.

## Phase 1 — Pure engine

*Offline, deterministic, framework-free (`rules.yaml` → `engine_contract`).*

### M2 · Engine core
- Immutable state model + projection scaffold.
- `resolveStartOfTurn` — the deterministic start-of-turn order
  (`game-specification.md` §5).
- Movement + `calculateMovementRange`, path/fuel rules
  (`game-specification.md` §10, §17).
- Economy/income (`game-specification.md` §6); `calculateLegalActions`
  (`game-specification.md` §11, §27.2); `end_turn`.
- Purity/determinism honored: injected randomness, no I/O, no wall clock.

### M3 · Engine combat, systems & fog
- Combat + `calculateCombatPreview`, counterattack, destruction, deterministic
  luck (`game-specification.md` §12).
- Capture (§13), repair/supply (§14), production (§6.4), transport (§16), join
  (§15), submarine (§19).
- Visibility + `calculateVisibility` / `projectStateForPlayer`
  (`game-specification.md` §18); victory + `evaluateVictory`
  (`game-specification.md` §23).
- The **declarative commander-modifier + power-meter mechanism** (§22.4–§22.5),
  data-driven with placeholder commander fixtures — real values gated by §33.1 (§5).

## Phase 2 — Server

### M4 · Persistence & data model
- Drizzle ORM + Neon PostgreSQL 17; tables per `database.md` §5: `users` + Auth.js
  adapter, `matches`, `match_players`, append-only `events`, `player_events`,
  `idempotency_keys`, `notification_jobs`.
- Migrations (Drizzle Kit, forward-only); optimistic-concurrency primitives
  (`SELECT … FOR UPDATE`, version column) (`database.md` §6–§10).

### M5 · Auth & account
- Auth.js magic-link via Resend; sessions; membership authorization on every read
  and write; notification preferences (`backend.md` §7, §10).

### M6 · Match lifecycle API
- `create` / `join` / `commander` / `ready` / `cancel`; invitation codes;
  ready→activate; data-version pinning at activation (`backend.md` §3, §11).
- **JIT blocker:** resolve §33.1 commander ADR + populate `commanders.yaml` before
  real commander selection; the UI can use placeholder commanders until then.

### M7 · Action pipeline & gameplay API
- Single `POST /api/matches/:id/actions` endpoint; the transactional pipeline
  driving the engine (`rules.yaml` → `action_processing.ordered_steps`,
  `backend.md` §4).
- Server-seeded randomness; resolved-event persistence; concurrency + idempotency;
  per-player projected reads (`backend.md` §5–§6, §8).

### M8 · Async model & notifications
- Turn deadlines (24h/3d/7d/none); Claim Victory
  (`rules.yaml` → `timeout_claim_rules`, `backend.md` §9).
- Resend notification triggers; durable jobs / recomputable timestamps
  (`backend.md` §10).

## Phase 3 — Client

*React DOM + Phaser canvas split (`frontend.md` §3); shadcn/ui + lucide +
react-hook-form + Zod (ADR-0001). Screens per `design-reference.md` §5.*

### M9 · App shell & lifecycle screens
- Dashboard, create match, invite/join, commander select (placeholder names),
  ready check, match completed.
- Forms use react-hook-form + Zod reusing the validation-boundary schemas
  (`coding-standards.md` §9).

### M10 · Battlefield
- Phaser render of the projected view; HUD; the interaction loop
  select→range→destination→preview→confirm→submit→animate (`frontend.md` §5).
- Previews reuse the pure engine in-browser, non-authoritative (`frontend.md` §6);
  animation of resolved events (`game-specification.md` §28).
- **JIT blocker:** render with stable internal sprite/terrain IDs until §9.5
  sprite-row mapping and §33.3/§33.4 art are approved; the real-art swap is a gated
  follow-up (§5).

### M11 · Opponent-turn replay
- Fog-filtered, per-player playback with a Skip control and a textual per-turn
  summary (`game-specification.md` §24.3, `frontend.md` §8).

## Phase 4 — Ship

### M12 · Acceptance, gated features, security & deployment
- Land the remaining JIT-gated features once their ADRs are accepted: commander
  names and powers (§33.1 — the passives landed with ADR-0006), day-limit scoring
  (§33.2/§23.4), real sprite/terrain/
  property art (§9.5/§33.3–§33.4), and the §33.5 edge-case decisions.
- All **30 acceptance scenarios** (`game-specification.md` §35) green; fog
  information-leak, concurrency, and replay-determinism suites (`testing.md`
  §8–§9); security/anti-cheat (`game-specification.md` §29).
- Deploy to **Vercel + Neon** with CI green.

---

# 6. Design-blocker dependencies (just-in-time)

Each blocker is resolved by an Accepted ADR before the milestone that needs it
(`decisions/README.md`, `definition-of-ready.md` §3.3). Resolved so far: §9.5 and
§33.4 (ADR-0005, battlefield art) and the **passive half** of §33.1 (ADR-0006).
The rest are open.

| Blocker | Gates | Resolved before |
|---|---|---|
| ~~§33.1 commander **passive effects**~~ — resolved by ADR-0006 | passive modifiers applied in play | landed with ADR-0006 |
| §33.1 commanders (names / faction names / powers / costs / art) | commander names in the UI, `activate_power`, the meter formula | M12 |
| §33.2 / §23.4 day-limit score | day-limit victory + score display | mechanism in M3; formula + display in M12 |
| §33.3 special-terrain art (Reef, Pipe, Pipe Seam, Missile Silo) | rendering those tiles | M10 real-art swap |
| §33.4 property art (ownership / neutral / capture-state) | property rendering | M10 real-art swap |
| §9.5 sprite-row mapping approval | final Phaser unit/terrain sprites | M10 real-art swap |
| §33.5 edge cases (elimination timing, repair with no funds, join-refund rounding, silo radius/damage, fog hidden-collision fuel, CO-meter charge) | correctness of the affected engine systems | the M2/M3 system that touches each |

---

# 7. Dependencies and parallelization

The layer order is strict, but some tracks overlap:

- **M4–M5** (persistence, auth) do not depend on the engine and may proceed
  alongside **M2–M3**.
- **M7** (action pipeline) needs both the engine (M2–M3) and persistence (M4).
- **M9** (lifecycle screens) needs the lifecycle API (M6).
- **M10** (battlefield) needs the action pipeline (M7) and the engine previews.
- **M11** (replay) needs the per-player projected event reads (M6–M7).

---

# 8. Cross-references

- `architecture.md` — §3–§6 layers, §10–§11 technology mapping and migration.
- `game-specification.md` — the behavior each milestone implements; §31.1
  (validation), §33 (blockers), §34 (Definition of Done), §35 (acceptance).
- `backend.md` / `database.md` / `frontend.md` — the per-layer contracts M4–M11
  realize.
- `definition-of-ready.md` — the entry gate every milestone task must pass.
- `testing.md` — the test layers and the exit-gate quality bar.
- `decisions/README.md` — the ADR mechanism that resolves §33 blockers just-in-time;
  `decisions/0001-frontend-ui-and-tooling-stack.md` — the tooling installed in M0.
- `design-reference.md` — the UI the client phases (M9–M11) build toward.
