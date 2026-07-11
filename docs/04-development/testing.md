# Iron Grid — Testing Strategy

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Engine, backend, frontend, data, QA, AI contributors

> This document defines *how Iron Grid is verified*: the test layers, what each
> one owns, and the acceptance bar a gameplay feature must clear before it is
> considered done.
>
> It **references** rather than restates the canonical test obligations. The
> required validation tests are canonical in `rules.yaml` →
> `required_validation_tests`; the acceptance scenarios are canonical in
> `game-specification.md` §35; the Functional Definition of Done is canonical in
> `game-specification.md` §34; build-time data validation is canonical in
> `game-specification.md` §31.1. This document organizes and points at them — it
> must never fork or renumber them.

---

# 1. Purpose and scope

This document answers: *what must be tested, at which layer, and when is a
feature verified enough to ship?*

It covers:

- The testing philosophy that determinism and layer isolation make possible.
- The test layers mapped to the architecture layers.
- Data validation, pure-engine, backend and frontend testing.
- Determinism/replay, concurrency and fog information-leak testing.
- Where the canonical acceptance scenarios live and how they bind.
- Coverage gates and the link to the Definition of Done.

It does **not** cover:

- The gameplay rules being tested → `game-specification.md`, `rules.yaml`.
- Coding conventions → `coding-standards.md`.
- Which layer depends on which → `architecture.md` §3–§4.
- Milestone order → `roadmap.md`.

---

# 2. Testing philosophy

The architecture is built to make verification cheap and total. Two properties
do the heavy lifting:

- **The engine is a pure, deterministic function** of
  `(state, action, gameData, randomSource)` (`architecture.md` §5,
  `rules.yaml` → `engine_contract`). Same input → same output. This means the
  bulk of gameplay behavior is testable with fast, hermetic unit tests — no
  database, no network, no clock, no flake.
- **Every layer boundary is a test seam** (`architecture.md` §3–§4). The engine
  is tested without a framework; the backend is tested for orchestration,
  authorization and concurrency; the frontend is tested for rendering and
  non-authority. Each layer is verified against the *contract* it exposes, not
  the internals of its neighbors.

Consequently the default test is a **pure-engine unit test**. Higher layers add
tests only for the concerns they uniquely own (I/O, transactions, projection
delivery, rendering). Do not re-test engine rules through the database.

**Depth: test the core, not the trivial.** Iron Grid deliberately keeps a
**lean, focused** test suite. Tests exist for the **main functionality** — the
mechanics and safety properties that the game is wrong without — not for
exhaustive permutations. The target is the canonical acceptance set
(`game-specification.md` §35 and `rules.yaml` → `required_validation_tests`),
which already enumerates the core end-to-end behaviors; treat it as the *target*,
not a floor to expand beyond. Add a narrower micro-test only when a real bug or
regression justifies pinning it down. Coverage percentage is **not** a goal.

---

# 3. Test layers

Tests mirror the four system layers. Dependencies — and therefore test scope —
point outer-to-inner.

| Layer | Test kind | Owns (what these tests prove) |
|---|---|---|
| `packages/game-data` | **Build-time validation** | The canonical YAML is schema-valid, cross-referenced and complete (§4). |
| `packages/game-engine` | **Pure unit tests** | The core rules, formulas and safety-critical edge cases — deterministically (§5). |
| `app/` backend | **Integration tests** | Authorization, the transactional pipeline, concurrency, idempotency, replay delivery, fog projection (§6). |
| `app/` frontend | **Component/interaction tests** | Rendering the projected view, the preview→confirm→submit loop, non-authority, accessibility (§7). |

The pyramid is deliberately bottom-heavy: many engine unit tests, fewer backend
integration tests, a thin layer of frontend tests. The engine's purity is what
lets it carry that weight.

---

# 4. Data validation tests (build time)

`game-data` validates `docs/02-data/*.yaml` before anything consumes it. These
run at build time and are canonical in `game-specification.md` §31.1; the loader
implements them with Zod (`architecture.md` §6, `coding-standards.md` §5).

The checks (from §31.1) include: schema, unique IDs, cross-references, complete
19×19 damage coverage where legal, no unknown movement types, no unknown
property categories, valid sprite row mapping, valid map dimensions, exactly two
player starts, valid HQ ownership, no disabled units in starting armies, and no
blocked terrain in production maps.

**Rules:**

- A validation failure is a **build failure**, not a warning. Invalid game data
  never reaches the engine.
- The `versioning` obligation (`required_validation_tests.versioning`,
  §31.2) — *"Active match remains bound to starting data version"* — is verified
  here for the data-version stamp and in the backend for its enforcement (§6).

---

# 5. Pure-engine tests

The engine is where most behavior is proven. Because it is pure and
framework-free, these tests are fast, isolated and deterministic
(`rules.yaml` → `engine_contract.purity` / `.determinism`).

**What they cover** — the canonical core set, and not much beyond it (§2):

- The public engine functions in `engine_contract.required_public_functions`
  (`validateAction`, `applyAction`, `projectStateForPlayer`,
  `calculateLegalActions`, `calculateMovementRange`, `calculateVisibility`,
  `calculateCombatPreview`, `resolveStartOfTurn`, `evaluateVictory`), exercised
  through the scenarios below rather than as isolated micro-tests.
- The categories in `rules.yaml` → `required_validation_tests` — match, turns,
  movement, combat, capture, repair/supply, production, transport, submarine,
  fog, asynchronous, concurrency, replay, versioning. This is the canonical core
  set that anchors the suite; assert it faithfully (do not weaken it) but do not
  multiply it into permutations it does not call for.
- **Core rounding boundaries.** The damage formula must have formula tests at its
  rounding boundaries (`game-specification.md` §12.4) — combat is central and
  its arithmetic must be exact. The other displayed-HP-driven computations
  (terrain-defense scaling, repair cap, join refund) get a small set of
  known-example tests, not a sweep of every input (§12.4, §14, §15.3).

**How they are written:**

- **Deterministic randomness.** Combat and any random-consuming step take an
  injected `randomSource` seeded by the test; luck is asserted against the
  persisted value, never against a live RNG (`game-specification.md` §12.6,
  §24.5). No test reads `Math.random`, `Date.now` or the wall clock.
- **State is immutable.** Tests assert `applyAction` returns a new `nextState`
  and leaves the input untouched (`coding-standards.md` §6).
- **Data-driven fixtures.** Test inputs reference `GameData`-shaped fixtures, not
  hardcoded unit/terrain names in engine logic (`coding-standards.md` §4).

---

# 6. Backend / integration tests

The backend owns orchestration, not rules. Its tests prove the *pipeline*
around the engine, not the engine's decisions (which §5 already covers).
Canonical obligations live in `rules.yaml` (`action_processing`,
`concurrency_rules`, `security_rules`, `timeout_claim_rules`, `replay_rules`,
`data_versioning`) and `game-specification.md` §24–§26, §29.

**What they cover:**

- **Authorization.** Membership is validated on every read and write; a session
  that is neither host nor accepted guest cannot access gameplay state
  (`backend.md` §7, `security_rules`). §34 requires *server authorization tests*.
- **Transactional pipeline.** The ordered steps of
  `action_processing.ordered_steps` run atomically; a failed action commits
  nothing and does not change `stateVersion` (`backend.md` §4).
- **Concurrency & idempotency** (`required_validation_tests.concurrency`): two
  actions with the same `expectedStateVersion` cannot both commit; a duplicate
  `idempotencyKey` returns the original result (`backend.md` §8). §34 requires
  *concurrent-action tests*.
- **Timeout / Claim Victory** (`required_validation_tests.asynchronous`,
  `timeout_claim_rules`): expired turns do not auto-end; a late valid action
  revokes the claim right; claim and late action race resolves atomically
  (`backend.md` §9).
- **Data-version pinning** (`data_versioning`, §31.2): a match loads and stays
  bound to its starting `GameData` version for actions and replay.
- **Replay delivery** (`replay_rules`): the authoritative event store is
  append-only and contiguous per match; clients receive per-player projections,
  never the authoritative stream (`backend.md` §6). §34 requires *replay event
  tests*.

---

# 7. Frontend tests

The client renders and collects intent; it is never authoritative
(`frontend.md` §1, `game-specification.md` §27.3). Its tests prove exactly that.

**What they cover:**

- **Non-authority.** Client previews (movement range, path, damage) are treated
  as disposable: on submit the returned authoritative event wins, and a
  disagreeing preview is discarded (`frontend.md` §6). Tests assert the client
  never commits or re-applies locally on conflict.
- **Renders the authoritative result.** §34 requires *Phaser renders the
  authoritative result*: the board reflects the resolved `Event`/`PlayerView`,
  driven by projected fields, not locally inferred state (`frontend.md` §4, §7).
- **Interaction loop.** The select → range → destination → preview → confirm →
  submit flow carries `expectedStateVersion` + `idempotencyKey`, and there is no
  undo (`frontend.md` §5, `game-specification.md` §10.4).
- **Conflict handling.** A typed stale-version conflict makes the client refetch
  the projected view and reconcile, never guess (`frontend.md` §9).
- **Accessibility.** Critical status exists as accessible HTML outside the
  canvas; faction identity is not conveyed by color alone; reduced-motion is
  honored (`frontend.md` §10, `game-specification.md` §27.4).

---

# 8. Determinism and replay testing

Determinism is a first-class, separately-tested property (`architecture.md` §8,
`game-specification.md` §24.5).

- **Reproducibility.** Given the same starting state, pinned data version, seed
  and action sequence, the entire match reproduces exactly — identical HP and
  luck outcomes (`required_validation_tests.replay`, §35 scenario 29).
- **Replay never rerolls.** Replaying an event reads the persisted luck/damage;
  it never re-invokes the RNG (`replay_rules`, `frontend.md` §8).
- **Event sequences are contiguous** and scoped per match; player replay respects
  historical visibility (`required_validation_tests.replay`).

---

# 9. Fog information-leak testing

Information security is verified adversarially, because a leak is a correctness
bug, not a cosmetic one (`architecture.md` §9, `game-specification.md` §18, §29).
§34 requires *fog information-leak tests where relevant*.

- **The server never ships hidden state.** Assert that `projectStateForPlayer`
  output for a player excludes everything that player may not see — hidden units,
  loaded cargo identity, submerged submarine positions
  (`required_validation_tests.fog`, `game-specification.md` §18.1, §18.7).
- **Fog-filtered replay leaks nothing.** Per-player event projections contain no
  hidden movement, events or IDs the player could not observe when they occurred
  (§35 scenario 22, `required_validation_tests.fog`).
- **Concealment follows data.** Forest/Reef concealment is asserted against
  `terrain.yaml`, not hardcoded (§35 scenario 21).

---

# 10. Acceptance scenarios

The **canonical acceptance suite is `game-specification.md` §35** — thirty
end-to-end scenarios (10-HP infantry captures in two turns, artillery cannot
move-and-fire, indirect attacks draw no counter, stale version rejects, claim
victory resolves atomically, replay reproduces exact HP/luck, active match stays
version-bound, …). They are the *minimum* the final engine test suite must
include.

`rules.yaml` → `required_validation_tests` is the same obligation expressed as
per-category assertions and is the machine-readable companion to §35.

These two lists **are** the core-functionality target of the suite (§2). The
intent is to satisfy them well — not to grow the suite past them. New scenarios
are added when a real feature or regression demands one, by editing §35 first,
not to chase coverage.

**Rules:**

- These lists are canonical and are **referenced, not copied** into test names or
  this document. A test may cite its scenario (`// §35 scenario 7`) but the
  wording of truth stays in the spec.
- Adding a scenario means editing `game-specification.md` §35 (and
  `required_validation_tests` where it applies) **first**, then the test —
  documentation before code (`project-manifest.md`).
- A scenario blocked by an open design blocker (`game-specification.md` §33 —
  commander effects, day-limit scoring, special-terrain edge cases) is written as
  a test only after the blocker is resolved. Until then the feature is not
  implementation-ready; do not infer behavior to make a test pass
  (`game-specification.md` §36).

---

# 11. Coverage gates and Definition of Done

A gameplay feature is done only when it satisfies the **Functional Definition of
Done, canonical in `game-specification.md` §34**. Restated here as gates, not as
a new source of truth:

1. Rule specified in `game-specification.md`.
2. Structured data exists in `02-data`.
3. Schema validation passes (§4).
4. Pure-engine tests pass (§5).
5. Server authorization tests pass (§6).
6. Fog information-leak tests pass where relevant (§9).
7. Replay event tests pass (§8).
8. Concurrent-action tests pass (§6).
9. Phaser renders the authoritative result (§7).
10. Documentation references remain valid.
11. No hardcoded unit/terrain/commander names in engine logic unless explicitly
    justified (`coding-standards.md` §4).

This is the gameplay-feature bar; the code-change bar (`tsc`, `pnpm lint`,
`cspell`) is in `coding-standards.md` §11–§12. Both must hold.

---

# 12. Tooling

The test runner is **Vitest**, chosen in
`decisions/0001-frontend-ui-and-tooling-stack.md`. It is not yet installed —
wiring it is a **code-phase task**, like Drizzle, Phaser and Auth.js
(`architecture.md` §10 "To add"). Vitest was selected because it satisfies every
requirement the strategy above imposes:

- **Fast, hermetic unit tests** for the pure engine — no DB, network or clock.
- **Deterministic execution** — no reliance on ambient randomness or wall-clock
  time; seeds are injected.
- **TypeScript + ESM native**, consistent with the workspace toolchain
  (`coding-standards.md` §2).
- **Runs per package** (engine and data testable in isolation) and integrates
  with backend integration tests for the `app/` layer.
- **CI gate:** the full suite plus `tsc`/`next build`, `pnpm lint` and `cspell`
  must pass before merge. The `husky` + `lint-staged` precommit hook runs the
  fast checks locally but does **not** replace the CI gate
  (`coding-standards.md` §11).

When Vitest is installed, add a `test` script to `package.json` running it.

---

# 13. Cross-references

- `game-specification.md` — §31.1 (data validation), §34 (Functional Definition
  of Done), §35 (acceptance scenarios), §12.4 (rounding), §18/§29 (fog/security),
  §24 (replay), §25 (concurrency), §33/§36 (blockers, do-not-guess).
- `rules.yaml` — `required_validation_tests` (canonical test obligations),
  `engine_contract` (purity/determinism), `action_processing`,
  `concurrency_rules`, `security_rules`, `timeout_claim_rules`, `replay_rules`,
  `data_versioning`.
- `architecture.md` — §3–§4 layers, §5 engine, §8 determinism, §9 information
  security, §10 technology mapping.
- `backend.md` — §4 pipeline, §6 reads/replay, §7 auth, §8 concurrency, §9 claim
  victory, §11 version pinning.
- `frontend.md` — §5 interaction loop, §6 non-authority, §7 animation, §8 replay
  playback, §9 concurrency, §10 accessibility.
- `coding-standards.md` — §5 validation boundary, §6 engine purity, §11–§12 code
  gates and definition of done.
- `project-manifest.md` — documentation-before-code, principles.
