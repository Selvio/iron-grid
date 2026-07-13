# Iron Grid — M2 · Engine core (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Engine contributors

> This is the **execution-detail** breakdown of milestone **M2** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the engine contract is `architecture.md` §4 and
> `rules.yaml` → `engine_contract`; the runtime state shape is
> `domain-model.md` and `rules.yaml` → `state_model`; behavior is
> `game-specification.md` §5/§6/§10/§11/§17/§27; the exit gate is
> `game-specification.md` §34, `testing.md`, and `coding-standards.md` §11–§12.

---

# 1. Purpose

M2 begins the **pure engine** (`packages/game-engine`, framework-free). It builds
the immutable runtime state model and the first slice of the engine's nine
contract functions (`rules.yaml` → `engine_contract.required_public_functions`):
the deterministic **start-of-turn** transaction, **movement** geometry and
validation, **income**, the legal-action enumeration, and **end-turn**. Combat,
capture, production, transport, visibility, victory and the commander mechanism
are **M3** — M2 builds the state, ordering and movement they will extend.

**Current state** (starting point): `packages/game-engine` is the M0 skeleton — a
placeholder export and the forbidden-dependency guard test; no runtime types and
no engine functions. `game-data` (M1) produces the typed, versioned `GameData`
the engine consumes on every call.

---

# 2. Gates for M2

- **Entry (DoR):** each ticket is specified with goal, scope, files and
  acceptance; the reference data it consumes exists and validates (M1). No open
  §33 blocker applies to the M2 scope — the one adjacency, **fog hidden-collision
  fuel** (§33.5, `movement_rules.hidden_collision`), only arises under fog, which
  lands with visibility in **M3**; M2 movement is normal-visibility only.
- **Exit (DoD):** the **pure-engine** slice of the Functional Definition of Done
  (`game-specification.md` §34: rule specified, data validates, **pure-engine
  tests pass**, no hardcoded unit/terrain names in engine logic) plus the
  code-change bar (`coding-standards.md` §11–§12) and the purity/determinism
  contract. Server-authorization, fog-leak, replay and concurrency tests belong to
  the layers that add them (M4–M7). The milestone-level DoD is in §5.

---

# 3. Cross-cutting decisions

- **Purity is absolute** (`rules.yaml` → `engine_contract.purity`,
  `domain-model.md` §15): every function is `f(state, …, gameData[, randomSource])
  → { nextState, events }`, returns new state via structural sharing, and **never
  mutates its inputs, performs I/O, reads the wall clock, or calls
  `Math.random`/`Date.now`**. A guard test/lint asserts the engine source
  references none of them (mirrors the M0-T3/T5 forbidden-dependency guards).
- **Wall-clock values are injected, never read.** Timestamps and absolute
  deadlines (`turn_deadline_at`, `started_at`) are stamped by the backend, not the
  engine. `resolveStartOfTurn` computes every deterministic state change and
  signals *that* a deadline/turn started; the caller supplies any clock value
  (`domain-model.md` §15, `backend.md`).
- **Deterministic randomness is injected** (`rules.yaml` → `randomness`): the
  engine takes a versioned `RandomSource` (seed + per-stream sequence index, named
  streams). M2's functions (movement, income, end-turn) **draw no randomness**;
  the interface is defined here and first consumed by M3 combat luck.
- **Data-driven, always** (`engine_contract`; `game-specification.md` §22.4): no
  hardcoded unit/terrain/property/commander ids in engine logic; everything
  resolves through `GameData`. The engine imports `GameData` as a **type-only**
  import from `game-data` (`import type`) so no runtime dependency is added and the
  purity guard is preserved. *(Confirms the `architecture.md` §4 type-coupling; the
  layer order data→engine makes this the lower layer's type.)*
- **The canonical order/enumeration is owned once, filled incrementally.**
  `resolveStartOfTurn` implements the full `turn_sequence.start_of_turn.ordered_
  steps` list; M2 fills its steps and leaves **no-op ordered hooks** for
  repair/resupply, commander-power, visibility and victory (M3). `calculate
  LegalActions` enumerates the actions M2 supports (`move_and_wait`, `end_turn`)
  and is extended, not rewritten, in M3.
- **Deterministic iteration order** (`turn_sequence.start_of_turn`): units and
  properties are processed in `y asc, x asc, id asc` order everywhere ordering is
  observable, so replays and tests are stable.
- **Test depth is focused** (`testing.md` §2, [[testing-depth-preference]]): anchor
  to the §35 scenarios in M2 scope (**#4** Tread path + per-tile fuel, **#5** Tire
  penalties, **#20** aircraft destroyed on unpaid daily fuel) plus start-of-turn
  income and turn-passing; do not chase coverage.

---

# 4. Tickets

## M2-T1 · Runtime state model & engine primitives
- **Goal:** the immutable runtime types and shared helpers every later function
  builds on.
- **Scope:**
  - Runtime state types from `rules.yaml` → `state_model` and `domain-model.md`
    §6–§12: `MatchState`, `PlayerState`, `UnitState`, `PropertyState`,
    `TerrainObjectState`, and the `Action` / `Event` envelopes (discriminated
    unions on `type`, `coding-standards.md` §5). Types are `readonly`.
  - Derived values are computed, not stored: `displayHp = ceil(trueHp / 10)`
    (§9.2) as a helper, never a field.
  - Immutable-update helpers (structural sharing): replace a unit/property by id,
    adjust funds, etc., returning a new `MatchState` without mutating the input.
  - Lookup helpers keyed by id and by coordinate (unit at `(x,y)`, property at
    `(x,y)`), plus the `y asc, x asc, id asc` ordering comparator.
  - The `RandomSource` interface (injected deterministic PRNG; named streams;
    sequence index) — defined, not yet drawn from.
  - `GameData` imported **type-only** from `game-data`; add `game-data` to the
    engine's dependencies. The nine `engine_contract` functions are declared with
    their signatures; the M3 ones may throw "not implemented in M2".
- **Files:** `packages/game-engine/src/{state,types,random,index}.ts` (+ helpers),
  `packages/game-engine/package.json`.
- **Acceptance:** the types compile under strict TS; update/lookup helpers have
  unit tests proving they do not mutate inputs; the forbidden-dependency guard
  still passes; no framework dependency is added.
- **Dependencies:** M1 complete.

## M2-T2 · `resolveStartOfTurn` (deterministic transaction)
- **Goal:** the ordered start-of-turn transaction (`game-specification.md` §5,
  `rules.yaml` → `turn_sequence.start_of_turn`).
- **Scope:**
  - Implement the ordered pipeline exactly: verify active player → advance
    turn/day counters → **grant property income** (§6.2: 1,000 per owned
    income-producing property; funds integrity §6.5) → *repair/resupply hooks
    (M3 no-op)* → **consume daily fuel** (§17.2, per-state for divers) → **destroy
    units unable to pay daily fuel** (§17.3: air/naval destroyed; ground survive at
    zero) → **reset per-turn action flags** → *commander-power hook (M3 no-op)* →
    *visibility hook (M3 no-op)* → *victory hook (M3 no-op)* → set-deadline signal
    (value injected, §3) → emit `turn_started` events.
  - Deterministic property/unit iteration order (`y asc, x asc, id asc`).
  - Returns `{ nextState, events }`; draws no randomness; reads no clock.
- **Files:** `packages/game-engine/src/start-of-turn.ts`, tests.
- **Acceptance:** income accrues only to owned income-producing properties;
  an air/naval unit that cannot pay daily fuel is destroyed (**§35 #20**), a
  ground unit at zero fuel survives; action flags reset; the M3 hooks are present
  and ordered; output is deterministic across runs.
- **Dependencies:** M2-T1.

## M2-T3 · Movement geometry: `calculateMovementRange` + path validation
- **Goal:** pure movement reachability and path validation with per-tile fuel
  (`game-specification.md` §10, §17.1; `rules.yaml` → `movement_rules`).
- **Scope:**
  - `calculateMovementRange(state, unitId, gameData)`: reachable tiles by summing
    `terrain.yaml` movement costs for the unit's movement type, bounded by
    **movement points and available fuel**; orthogonal only, in-bounds, impassable
    (`null` cost) and Pipe barriers blocked, enemy units block and cannot be passed,
    friendly units may be passed but not ended on (§10.2, `movement_rules`).
  - Path validation for a submitted ordered path: starts at the unit's tile, each
    step orthogonal and traversable, cumulative cost ≤ movement points, **fuel =
    one per traversed tile** (§10.3, not per movement-point cost), no enemy
    pass-through, destination unoccupied (Join/Load exceptions are M3).
  - Normal visibility only; the fog hidden-collision fuel rule
    (`movement_rules.hidden_collision`, §33.5) is deferred to M3 with fog.
- **Files:** `packages/game-engine/src/movement.ts`, tests.
- **Acceptance:** a Tread unit traverses a valid path and spends fuel by tiles
  (**§35 #4**); a Tire unit pays the higher Forest/terrain movement cost while
  still spending one fuel per tile (**§35 #5**); range shrinks when fuel < movement
  points; impassable/enemy tiles are excluded.
- **Dependencies:** M2-T1.

## M2-T4 · `move_and_wait` and `end_turn` (validate/apply)
- **Goal:** the two M2 state-transition actions through the engine's validate/apply
  path (`rules.yaml` → `action_processing.ordered_steps`, engine-owned steps only).
- **Scope:**
  - `validateAction` + `applyAction` for **`move_and_wait`**: validate the path
    (M2-T3), then apply — move the unit, deduct one fuel per traversed tile, mark
    `has_acted`, emit `unit_moved` (+ terminal `unit_waited`) events. No undo;
    committed on success (§10.4).
  - **`end_turn`** (`turn_sequence.end_turn.ordered_steps`): emit `turn_ended`,
    clear the current turn's expired claim, select the next player, and run
    `resolveStartOfTurn` (M2-T2) for that player.
  - Honor the engine-owned `action_processing` steps: legality check → apply state
    → create authoritative events. Authentication, authorization, expected-state-
    version and persistence are backend concerns (M7), not the engine.
  - Funds/fuel integrity: no negative funds (§6.5); failed validation changes
    nothing (§ failure block: no partial commit).
- **Files:** `packages/game-engine/src/actions/{move-and-wait,end-turn}.ts`,
  `validate.ts`, `apply.ts`, tests.
- **Acceptance:** a legal move updates position/fuel/`has_acted` and emits the
  resolved events; an illegal move (out of range, onto an enemy, insufficient fuel)
  is rejected with no state change; `end_turn` hands the turn over and triggers the
  next player's start-of-turn; the moved unit cannot act again this turn.
- **Dependencies:** M2-T2, M2-T3.

## M2-T5 · `calculateLegalActions` + purity guard + acceptance
- **Goal:** enumerate the legal actions for the active player in the M2 scope and
  lock in the milestone's purity/determinism and acceptance gates.
- **Scope:**
  - `calculateLegalActions(state, playerId, gameData)` (§11, §27.2): for each of the
    active player's not-yet-acted units, the reachable `move_and_wait` destinations
    (M2-T3) and `Wait`; plus `end_turn`. The enumeration is structured to be
    **extended** in M3 (attack/capture/produce/…), not rewritten.
  - A **purity/determinism guard**: a test (and/or `no-restricted-imports` lint)
    asserting the engine source references no `Date`, `Math.random`, I/O or
    framework symbol; and that repeated calls on equal input yield equal output.
  - The M2 acceptance suite (`testing.md`): §35 **#4**, **#5**, **#20**, plus
    start-of-turn income accrual and a full turn-passing cycle.
- **Files:** `packages/game-engine/src/legal-actions.ts`,
  `packages/game-engine/src/*.test.ts`, guard test/lint config.
- **Acceptance:** legal actions match hand-computed expectations on a small fixture
  state; an acted unit offers no further actions; the purity guard fails if a
  forbidden symbol is introduced; the acceptance suite is green.
- **Dependencies:** M2-T4.

**Ordering:** M2-T1 → M2-T2 ∥ M2-T3 → M2-T4 → M2-T5.

---

# 5. Definition of Done for M2

M2 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and
   `pnpm build` are all green.
2. `packages/game-engine` exposes the immutable state model and the M2 functions
   — `resolveStartOfTurn`, `calculateMovementRange`, `calculateLegalActions`,
   `validateAction`/`applyAction` for `move_and_wait` and `end_turn` — each pure,
   deterministic and consuming `GameData` on every call.
3. The engine draws no randomness in M2, reads no clock, performs no I/O, and
   contains no hardcoded unit/terrain/property/commander names; the purity guard
   and the forbidden-dependency guard both pass.
4. `resolveStartOfTurn` runs the full canonical ordered step list with the M3
   steps present as no-op hooks, preserving order for M3 to fill.
5. Pure-engine tests cover §35 **#4**, **#5**, **#20**, income accrual and
   turn-passing, and are green under CI.

---

# 6. Cross-references

- `roadmap.md` — M2's place in the sequence (§5), the layered strategy (§2), and
  the §33.5 edge-case → milestone map (§6).
- `architecture.md` — §4 the engine package boundary and the forbidden
  dependencies; §3/§11 the data→engine layer order.
- `rules.yaml` → `engine_contract` (functions, purity, determinism),
  `state_model` (runtime shape), `turn_sequence`, `action_processing`,
  `movement_rules`, `randomness`.
- `domain-model.md` — the runtime entities and invariants the types encode (§6–§15).
- `game-specification.md` — §5 start-of-turn, §6 economy, §10 movement, §11
  actions, §17 fuel/ammo, §27.2 selection flow, §33.5 (fog collision blocker),
  §34 Definition of Done, §35 acceptance scenarios.
- `testing.md` — the pure-engine test layer and the focused-depth principle.
- `coding-standards.md` — §5 discriminated unions / no `any`, §11–§12 the bar.
- `definition-of-ready.md` — the entry gate each ticket satisfies.
