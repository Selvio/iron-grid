# Iron Grid — M7 · Action pipeline & gameplay API (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Backend / engine / QA contributors

> This is the **execution-detail** breakdown of milestone **M7** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place is
> `roadmap.md` §5; the canonical pipeline is `rules.yaml` →
> `action_processing.ordered_steps` (mirrored in `backend.md` §4), with concurrency
> in §8 / `concurrency_rules`, determinism in §5 / `randomness`, reads/projection in
> §6, turn flow in `turn_sequence`, and security in §12 / `security_rules`. It
> composes the M4 persistence/concurrency/idempotency/event primitives
> (`database.md` §3, §6–§8, §10), the M5 auth primitives (`backend.md` §7) and the
> M6 activation that produces the first live snapshot. The entities are
> `domain-model.md` §11 (Action), §12 (Event), §13 (PlayerView), §14–§15
> (invariants, versioning). The exit gate is `game-specification.md` §24–§25, §34,
> §35 (#23–#25, #27–#30), `testing.md` §6 and `coding-standards.md` §11–§12.

---

# 1. Purpose

M7 continues **Phase 2 — Server**. On M4's persistence/concurrency/event primitives,
M5's identity/authorization, and the M6 activation that lands the first
authoritative snapshot, it builds the **gameplay engine of the server**: the single
**transactional action pipeline** that accepts a player's gameplay action for an
**active** match, runs the canonical `action_processing.ordered_steps` as one atomic
transaction, and the **player-projected read endpoints** that expose the resulting
state. It is the first milestone that drives the pure engine's action functions
(`validateAction`, `applyAction`, `projectStateForPlayer`, `calculateVisibility`,
`evaluateVictory`, `resolveStartOfTurn`) behind the authenticated, authorized,
optimistically-concurrent, idempotent boundary the spec requires (§24–§25).

M7 delivers: the **deterministic seeded randomness** the engine's contract assumes
but no code yet implements; the **pipeline core** and `POST /api/matches/:id/actions`;
the **`end_turn`** hand-off (next player's start-of-turn, deadline stamping, day
advance); the **`resign`** action and immediate completion; the **read endpoints**
(`GET /api/matches/:id`, `GET /api/matches/:id/events?since=`) with per-player
projection; and the **concurrency/idempotency acceptance suite** — including the
two-real-connection row-lock contention test **deferred from M4-T7**.

M7 stops at the **turn-deadline / claim boundary**: turn-deadline **expiry**
handling, **`claim_victory`**, `timeout_claimed`, and the **notification
scheduling/delivery** those turns enqueue are **M8** (`roadmap.md` §5,
`backend.md` §9–§10) — even though `turnDeadlineAt` and `expiredTurnClaimAvailableTo`
already exist in state and M6 stamps the deadline. The branded gameplay UI is **M9**;
in-browser previews (`calculateLegalActions` / `calculateCombatPreview`) are
non-authoritative client engine calls (`frontend.md` §6), **not** server endpoints,
and are **M10**. M7 lands the authoritative mutation and read surface those layers
consume.

**Current state** (starting point): the finished M6 workspace — `app/server/{db,auth,
account,lifecycle}` and the five lifecycle endpoints; a match can be created, joined,
commander-selected, readied and **activated** into an `active` snapshot with a pinned
`game_data_version`, a `random_seed`, and the first `turn_started` events. The engine
exposes the nine contract functions and `createInitialMatchState`, and the M4
primitives (`lockMatchForUpdate`, `assertStateVersion`, `StateVersionConflictError`,
`recordIdempotentResult`, `appendEvents`/`insertPlayerEvents`, `persistMatchSnapshot`)
are landed and re-exported from `app/server/db`. **No action endpoint, no read
endpoint, no `RandomSource` implementation, no `resign`/`claim_victory` engine
variant, and no multi-connection test harness exist yet.** The `notification_jobs`
table exists (M4-T6) but has no enqueue helper — untouched here.

---

# 2. Gates for M7

- **Entry (DoR):** each ticket is specified with goal/scope/files/acceptance; the
  pipeline it realizes is `action_processing.ordered_steps`; the primitives it
  composes are landed (M4/M5/M6); the engine action union and `applyAction` /
  `validateAction` are implemented (M2–M3). **§33 blockers that apply to M7:**
  §33.1 (commander data) gates the **`activate_power`** action, the power meter and
  commander modifiers (`implementation_blockers.commander-data`) — M7 ships the
  pipeline and **rejects/gates `activate_power`** cleanly, it does not resolve real
  effects; §33.2 (day-limit scoring) means `day_limit_match_completion` is **not
  scored** (settings.`dayLimit` stays opaque); §33.5 (army-elimination edge case)
  — the zero-units-with-production timing follows the **approved** test outcome, not
  an inferred rule. No art blocker (§33.3–§33.4) gates the server pipeline.
- **Exit (DoD):** the **action/read slice** of the Functional Definition of Done
  (`game-specification.md` §24–§25, §34): a validated action from the active player
  commits atomically with a monotonic `state_version`, correct events + per-player
  projections, and victory evaluation; a stale `expectedStateVersion` is rejected
  with the typed conflict and no state change; a duplicate `idempotencyKey` returns
  the original result without re-applying; `end_turn` hands off to the next player's
  start-of-turn atomically; `resign` completes the match; the read endpoints return
  player-projected state/events — **against the M6 fixtures** — plus the code-change
  bar (`coding-standards.md` §11–§12). Turn-deadline expiry, `claim_victory` and
  notification delivery are **out of scope** (M8). The milestone DoD is §5.

---

# 3. Cross-cutting decisions

- **The pipeline is one atomic transaction, mechanically the 14 ordered steps.**
  Every mutation runs `action_processing.ordered_steps` inside a single
  `db.transaction` (mirroring M6 `ready.ts`): `authenticate_player` (`requireUser`)
  → `authorize_match_membership` (`requireMatchMembership(tx, …)`) →
  `verify_match_status` (status `active` under the lock, else `match_not_active`) →
  `verify_expected_state_version` (`lockMatchForUpdate` + `assertStateVersion`, else
  the typed `StateVersionConflictError` → **409**) → `validate_action_payload_schema`
  (envelope/shape + active-player, else `not_active_player`) →
  `validate_action_legality` (`validateAction`) → `resolve_deterministic_randomness`
  (seeded `RandomSource`, T1) → `apply_state_changes` (`applyAction`) →
  `create_authoritative_events` (`appendEvents`) → `evaluate_visibility_changes`
  (`calculateVisibility`) → `create_player_event_projections` (`insertPlayerEvents`,
  T6) → `evaluate_victory` (`evaluateVictory`, already run inside `applyAction`) →
  `increment_state_version` **in-state** → `persist_atomically`
  (`persistMatchSnapshot`). **Failure commits nothing** (`action_processing.failure`:
  no partial commit, no random/ammo/funds consumed, `state_version` unchanged).
- **Version bump is in-state, mirrored by the snapshot writer — never both writers.**
  The engine bumps `meta.stateVersion` in `nextState`; `persistMatchSnapshot` mirrors
  it to the `state_version` column in the same UPDATE (`database.md` §10). M7 **must
  not** also call `incrementStateVersion` (the column-only bump) on the same commit —
  doing so drifts the column from the snapshot (`concurrency.ts` / `matches.ts`
  docstrings). The action pipeline sets `nextState.match.stateVersion = current + 1`
  and persists once.
- **Idempotency wraps the whole transaction.** Every action carries an
  `idempotencyKey` (`ActionEnvelope`); `recordIdempotentResult(tx, matchId, key,
  result)` dedupes on `unique(match_id, key)` — a duplicate returns the stored
  `committedResult` **without re-applying** (`action_processing.idempotency`). The
  **committed-result shape** is fixed by M7 (I-8): a small JSON envelope
  `{ stateVersion, status, completed, winnerPlayerId?, completionReason? }` — enough
  for the client to reconcile; the fresh projected view is fetched via the read
  endpoint. The key is checked at the head of the transaction (after auth) so a
  replay short-circuits before re-locking/applying.
- **Determinism is a seeded, streamed, replay-safe PRNG (T1), advanced only on
  commit.** The engine's `RandomSource` contract (`random.ts`) has no implementation.
  M7 adds a **pure engine** `createRandomSource(seed, startIndex)` — a versioned PRNG
  keyed by `(deterministicSeed, RandomStream, drawIndex)` so `combat_luck` and
  friends never interfere (`randomness.non_combat_randomness.use_separate_named_streams`),
  exposing the number of draws taken. The pipeline seeds it from
  `meta.deterministicSeed` + `meta.randomSequenceIndex`, and on a **committed** action
  advances `randomSequenceIndex` by the draw count (a **failed** action consumes no
  sequence — `action_processing.failure`). Replay redraws identically from the pinned
  seed + index (`randomness.replay`).
- **Only the active player mutates; `claim_victory` is the one inactive-opponent
  exception (deferred).** `validate_action_payload_schema` rejects a non-active
  submitter with `not_active_player` (`backend.md` §7). `resign` and `end_turn` are
  active-player actions; `claim_victory` (inactive opponent, §9) is **M8**.
- **Reads are membership-checked and player-projected.** `GET /api/matches/:id`
  returns `projectStateForPlayer(state, viewerPlayerId, gameData)` (`PlayerView`,
  `domain-model.md` §13); `GET /api/matches/:id/events?since=` reads **`player_events`**
  (never authoritative `events`). Both compose `requireUser` +
  `requireMatchMembership`. No legal-actions / combat-preview endpoint exists —
  those are client-side engine calls (`frontend.md` §6), **M10**.
- **Gameplay events are projected with real fog now (unlike M6 activation).** M6 wrote
  activation `player_events` unprojected because they are public; M7 gameplay events
  are visibility-filtered per player via `calculateVisibility` before
  `insertPlayerEvents` (`create_player_event_projections`), so a hidden-unit action
  never leaks through the projection (`security_rules`, `replay_rules`).
- **Action-layer server-only and one-directional.** The pipeline lives under
  `app/server/actions` (or extends `app/server/lifecycle`), composes db+auth+engine,
  and is never imported by the pure packages (the forbidden-import guard is extended
  to `server/(…|actions)`). Deps are injected (`db`, `resolveSession?`, `gameData`,
  `now`, `randomSource`), mirroring the M6 lifecycle pattern for testability.
- **Action rate limiting** (`security_rules.action_rate_limit_required`): the actions
  endpoint applies an action rate limit (reusing the M6 injectable limiter seam,
  keyed by user).

---

# 4. Tickets

## M7-T1 · Deterministic seeded RandomSource (engine)
- **Goal:** the replay-safe, streamed PRNG the engine's `RandomSource` contract
  assumes, so combat and other draws are deterministic per match
  (`backend.md` §5; `rules.yaml` → `randomness`; `random.ts`).
- **Scope:**
  - A **pure `game-engine`** `createRandomSource(seed: string, startIndex: number)`:
    a stable versioned PRNG that derives each draw from `(seed, stream, index)` so the
    named streams (`combat_luck`, `combat_counter_luck`, `first_player`,
    `commander_first_picker`) never interfere; deterministic for a given seed+index.
  - Expose the **draw count** taken (so the pipeline can advance
    `randomSequenceIndex` by exactly the committed draws) without breaking the
    injected `RandomSource` interface combat already consumes.
  - No wall clock, no `Math.random`, no I/O (`engine_contract.purity`).
- **Files:** `packages/game-engine/src/random-source.ts` (impl) + `index.ts` export,
  tests (determinism, stream independence, index advance, replay equality).
- **Acceptance:** identical `(seed, index, stream, range)` yields identical draws;
  different streams at the same index are independent; the draw count matches the
  number of `nextInt` calls; two runs from the same seed+index reproduce a combat
  outcome bit-for-bit; `tsc`/`lint`/tests green.
- **Dependencies:** M2–M3 engine (`RandomSource` interface, combat consumer).

## M7-T2 · Action envelope validation, actions-layer scaffolding & multi-connection harness
- **Goal:** the boundary validation and shared plumbing every action composes, and
  the real two-connection Postgres test harness deferred from M4-T7 (`m4-persistence.md`
  §3; `concurrency_rules`).
- **Scope:**
  - **Envelope validation**: parse a raw request body into a typed `Action`
    (discriminated on `type` over the resolvable set — `move_and_wait`, `attack`,
    `capture`, `produce`, `supply`, `join`, `load`, `unload`, `dive`, `surface`,
    `end_turn`, and `resign` from T5), with `expectedStateVersion`, `idempotencyKey`,
    `playerId`; reject unknown/gated types (`activate_power` §33.1, `launch_missile`
    §33.3) with a typed error; malformed → typed 400.
  - **Actions deps + errors**: an `ActionDeps` shape (mirroring `LifecycleDeps`:
    `db`, `resolveSession?`, `gameData`, `now?`, `randomSource?`, `rateLimiter?`) and
    an actions `errorResponse` mapping the typed errors — including
    `StateVersionConflictError` → **409** (with `currentStateVersion`),
    `match_not_active`, `not_active_player`, and the engine `ValidationError` codes.
  - **Multi-connection harness** *(CI-infra-gated)*: a real-Postgres harness that opens
    **two concurrent connections** so row-lock contention can be genuinely exercised —
    PGlite is single-connection and cannot (`harness.ts`). **This environment has no
    local Postgres / `pg` driver**, so the contention test is gated on a
    `TEST_DATABASE_URL` (runs in CI, skipped otherwise). Because the `FOR UPDATE` lock
    serializes contenders, the **sequential** PGlite version-conflict test (T3/T7) is
    outcome-equivalent and is the always-run proof of the guard; the two-connection
    test adds CI-only defense-in-depth. See §6.
- **Files:** `app/server/actions/envelope.ts`, `app/server/actions/deps.ts`,
  `app/server/actions/http.ts`, `app/server/actions/errors.ts`, tests; the
  CI-gated multi-connection harness lands with the CI Postgres infra.
- **Acceptance:** a well-formed envelope parses to the typed action; a missing/invalid
  `expectedStateVersion`/`idempotencyKey`/`type` is rejected 400; a gated action type
  is rejected with its typed 422; `StateVersionConflictError` maps to 409 carrying the
  safe version; `tsc`/`lint`/tests green.
- **Dependencies:** M4-T7 (concurrency primitives), M6 (lifecycle patterns).

## M7-T3 · The transactional action pipeline & `POST /api/matches/:id/actions`
- **Goal:** the atomic pipeline that authorizes, validates, applies and persists an
  action, exposed as the single gameplay endpoint (`backend.md` §3–§4, §8;
  `action_processing`).
- **Scope:**
  - `applyActionPipeline(tx-owning deps, matchId, action)` — the 14 `ordered_steps`
    (§3) in one `db.transaction`: idempotency short-circuit → `requireUser` →
    `lockMatchForUpdate` → `requireMatchMembership` → status `active` →
    `assertStateVersion(current, action.expectedStateVersion)` → active-player check →
    `validateAction` → seeded `RandomSource` (T1) from seed+index →
    `applyAction` → bump `meta.stateVersion` → `appendEvents` → per-player projections
    (T6 helper; unprojected acceptable until T6 lands) → `persistMatchSnapshot` →
    advance `randomSequenceIndex` → `recordIdempotentResult`. Failure rolls back whole.
  - `POST /api/matches/:id/actions` — thin route (Node runtime, inject `db` +
    `loadGameData`), `handleSubmitAction` dispatching by `Action.type`; **action rate
    limit**; returns `{ stateVersion, status, … }` (the committed-result envelope) or
    the typed error.
- **Files:** `app/server/actions/pipeline.ts`, `app/server/actions/submit.ts`,
  `app/api/matches/[id]/actions/route.ts`, tests (PGlite: a `move_and_wait` commits;
  stale version 409; duplicate key replays; non-member 403; non-active 409/`not_active_player`).
- **Acceptance:** a legal action from the active player commits — `state_version` +1,
  events appended, snapshot mirrors — and returns the committed envelope; a stale
  `expectedStateVersion` returns the typed 409 and **no** state change; a duplicate
  `idempotencyKey` returns the original result without re-applying; an illegal action
  returns the engine's typed validation error with nothing committed; membership /
  active-player / status violations return 403 / 409 respectively.
- **Dependencies:** M7-T1, M7-T2.

## M7-T4 · `end_turn` hand-off, per-turn deadline & day advance
- **Goal:** applying `end_turn` atomically starts the next player's turn with income,
  a stamped deadline and the day advance (`turn_sequence`; spec §5).
- **Scope:**
  - Route `end_turn` through the pipeline; `applyAction`'s `end_turn` composes
    `resolveStartOfTurn` for the next player → `turn_ended` + `turn_started` (+ income
    etc.) events; the pipeline stamps `turnDeadlineAt` (`withTurnDeadline`, mirroring
    M6 `ready.ts` + `TURN_DEADLINE_MS`) into the persisted meta and advances the day
    counter per `advance_turn_and_day_counters` (day advances when the second player
    of the day ends — `time_model.day_definition`).
  - Per-player projections for the hand-off events; `active_player_id` mirror flips.
- **Files:** pipeline `end_turn` branch, deadline helper (shared with lifecycle),
  tests (PGlite: end_turn flips active player, day advances on the second end, deadline
  stamped, `cannot_undo`).
- **Acceptance:** the active player's `end_turn` commits, flips `active_player_id`,
  emits `turn_ended` + `turn_started`, stamps the next `turn_deadline_at`, advances
  `day_counter` only when the day's second player ends; the inactive player cannot
  `end_turn` (`not_active_player`).
- **Dependencies:** M7-T3.

## M7-T5 · `resign` action & immediate completion
- **Goal:** the active player may resign, completing the match immediately in the
  opponent's favor (`resignation` rules; spec §4.5).
- **Scope:**
  - Add the **typed `ResignAction`** variant + engine processor (the engine currently
    types `resign` only as an opaque `FutureAction`): validate active player + active
    match, mark the player `resigned`, and let `evaluateVictory` complete the match
    with winner = opponent, `completionReason: "resignation"`, emitting
    `player_resigned` + `match_completed`.
  - Route `resign` through the pipeline; a completed match is thereafter
    gameplay-immutable (`completed_match_gameplay_immutable`).
- **Files:** `packages/game-engine/src/resign.ts` (+ union/index wiring), pipeline
  `resign` branch, tests (engine: resign → victory; PGlite: resign completes the match,
  status `completed`, winner/reason set, later actions rejected `match_already_completed`).
- **Acceptance:** the active player's `resign` completes the match — status
  `completed`, `winner_player_id` = opponent, `completion_reason` `resignation`,
  `match_completed` event — atomically; a subsequent action returns
  `match_already_completed`; a non-active resign is rejected.
- **Dependencies:** M7-T3.

## M7-T6 · Per-player event projection & read endpoints
- **Goal:** the player-projected read surface and the visibility-filtered event
  projection the pipeline writes (`backend.md` §6; `domain-model.md` §13;
  `replay_rules`).
- **Scope:**
  - `GET /api/matches/:id` — `requireUser` + `requireMatchMembership`;
    `projectStateForPlayer(state, viewerPlayerId, gameData)` → the viewer's
    **fog-filtered** board + public meta + the viewer's **own** private economy
    (opponent funds/powerMeter never exposed). This is the primary anti-cheat read
    surface and does real fog projection today.
  - `GET /api/matches/:id/events?since=` — membership-checked; returns the viewer's
    `player_events` with `sequence > since`, ordered.
  - Per-event fog redaction of the event stream: identity for a fog-off match (the
    fixture), so the pipeline's per-player rows are already the correct projection;
    fog-**on** per-event redaction is deferred (see §6).
- **Files:** `app/server/actions/projection.ts`, `app/api/matches/[id]/route.ts`,
  `app/api/matches/[id]/events/route.ts`, tests (PGlite: read returns the viewer's
  projected state; a non-member is 403; events filtered by `since` and by viewer).
- **Acceptance:** the read returns the caller's `PlayerView` (own funds/powerMeter
  private; opponent hidden state absent); the events read returns only the viewer's
  projections after `since`; both reject a non-member with 403; the pipeline writes
  fog-projected `player_events`.
- **Dependencies:** M7-T3.

## M7-T7 · Concurrency & idempotency acceptance suite
- **Goal:** prove the exactly-once, stale-rejection and lock-serialization contract
  under real contention (`concurrency_rules`; `required_validation_tests.concurrency`;
  spec §35 #23–#24).
- **Scope:**
  - Using the T2 multi-connection harness: two actions with the **same
    `expectedStateVersion`** — exactly one commits, the other gets the typed conflict;
    row-lock serialization of two concurrent submissions.
  - Duplicate `idempotencyKey` returns the original committed result (no double
    apply); a failed action leaves `state_version`, ammo, funds and random sequence
    unchanged.
- **Files:** `app/server/actions/__tests__/concurrency.test.ts` (two-connection),
  idempotency/failure tests.
- **Acceptance:** the two-connection contention test passes deterministically (one
  win, one typed 409 with the safe version); duplicate-key replay returns the stored
  result; a rejected action is a no-op on every consumable.
- **Dependencies:** M7-T2 (harness), M7-T3 (pipeline).

**Ordering:** M7-T1 → M7-T2 → M7-T3 → { M7-T4 ∥ M7-T5 ∥ M7-T6 } → M7-T7.
(T1 PRNG and T2 scaffolding underpin the T3 pipeline; end_turn / resign / reads build
on the pipeline independently; the contention suite needs the pipeline + harness.)

---

# 5. Definition of Done for M7

M7 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and `pnpm build`
   are green, and `pnpm db:generate` / `pnpm db:migrate` report the expected schema
   (no unintended migration).
2. `createRandomSource` is a pure, deterministic, streamed, replay-safe PRNG with an
   exposed draw count; identical seed+index reproduces combat bit-for-bit (§5,
   `randomness`).
3. `POST /api/matches/:id/actions` runs the full `action_processing.ordered_steps`
   atomically: a legal action from the active player commits with `state_version` +1,
   authoritative events, fog-projected per-player events, victory evaluation, and the
   mirrored snapshot; a failed action commits nothing (`action_processing.failure`).
4. Optimistic concurrency holds: a stale `expectedStateVersion` is rejected with the
   typed `StateVersionConflictError` (409, current safe version, no hidden state), and
   under real two-connection contention exactly one of two same-version actions
   commits (`concurrency_rules`; spec §35 #23).
5. Idempotency holds: a duplicate `idempotencyKey` returns the original committed
   result without re-applying (spec §35 #24).
6. `end_turn` atomically starts the next player's turn (income, `turn_started`,
   stamped deadline, day advance); `resign` completes the match immediately
   (`resignation`, opponent wins) and a completed match is gameplay-immutable.
7. The read endpoints return player-projected state (`GET /api/matches/:id`) and the
   viewer's projected events (`GET /api/matches/:id/events?since=`), membership-checked
   (`backend.md` §6).
8. Integration tests (`testing.md` §6) cover the pipeline happy path, stale-version
   409, duplicate-key replay, illegal-action rejection (no-op), non-member 403,
   non-active-player rejection, `end_turn` hand-off, `resign` completion, the reads,
   and the two-connection contention test — green under CI.
9. Scope stays inside the action/read slice: **no** turn-deadline expiry sweeper,
   **no** `claim_victory` / `timeout_claimed`, **no** notification scheduling/delivery
   (M8), **no** branded UI or client previews (M9/M10); `activate_power` and
   `launch_missile` are cleanly gated/rejected (§33), and the pipeline runs on the M6
   fixtures.

---

# 6. Deferred design gates & scope boundaries (not in M7)

- **Turn-deadline expiry, `claim_victory`, `timeout_claimed`** (`backend.md` §9,
  `timeout_claim_rules`, `time_model.expiration`) — the **deadline sweeper** and the
  inactive-opponent claim are **M8** (`roadmap.md` §5). M7 **stamps** `turnDeadlineAt`
  per turn and carries `expiredTurnClaimAvailableTo` in state, but does not act on
  expiry.
- **Notification scheduling / delivery** (`backend.md` §10, `notifications`) — the
  pipeline enqueues **nothing**; `notification_jobs` scheduling and Resend delivery are
  **M8**. (The `ordered_steps` contain no notification step.)
- **`activate_power` / power meter / commander modifiers** (§33.1) — the action type is
  gated: validated-as-unavailable/rejected until the commander ADR + `commanders.yaml`
  land. **Day-limit victory scoring** (§33.2) is not scored; **army-elimination edge
  case** (§33.5) follows the approved test outcome.
- **`launch_missile`** (§33.3 special terrain) — remains an unsupported action type,
  rejected cleanly, until the Missile Silo asset/radius/damage design lands.
- **Real commander roster & official maps** — still design-gated (M6 §6); M7 tests run
  on the placeholder commander + test-map fixtures.
- **Client-side previews** (`calculateLegalActions` / `calculateCombatPreview`) — pure
  in-browser engine calls, **M10** (`frontend.md` §6), not server endpoints.
- **True two-connection row-lock contention test** — requires a real Postgres (`pg` +
  `TEST_DATABASE_URL`) not present in the current dev environment; lands with the CI
  Postgres infra and is skipped otherwise. The version-conflict **guard** is proven by
  the always-run sequential PGlite test (outcome-equivalent under `FOR UPDATE`).
- **Fog-on per-event redaction of the event stream** — the **state** read
  (`GET /:id`) is fog-projected today (`projectStateForPlayer`), the real anti-cheat
  surface. Redacting the per-event `player_events` **stream** for a fog-**on** match
  needs a per-event visibility primitive the engine does not expose (no
  `projectEventForViewer`) and per-event rules that are underspecified; with the
  fog-off fixture the pipeline's per-player rows are already correct. Deferred until a
  fog-on scenario/fixture exists.

---

# 7. Cross-references

- `roadmap.md` — §5 (M7 entry; M8 owns deadlines/Claim Victory/notifications; M10
  owns previews), §6 (§33 blocker map), §7 (M7 composes engine M2–M3 + persistence M4
  + auth M5 + lifecycle M6).
- `backend.md` — §3 (API surface), §4 (the pipeline, quoted), §5 (engine integration /
  determinism / seed), §6 (reads / projection / replay), §7 (authz / active player /
  claim_victory exception), §8 (concurrency), §9 (deadlines / Claim Victory — M8),
  §10 (notifications — M8), §12 (security / `client_values_ignored` / rate limits).
- `database.md` — §3 (snapshot + mirror), §6 (locking), §7 (append-only events), §8
  (pinning), §10 (transaction boundary).
- `domain-model.md` — §11 (Action), §12 (Event), §13 (PlayerView), §14 (invariants:
  monotonic `stateVersion`, completed-match immutability), §15 (versioning /
  concurrency).
- `rules.yaml` — `action_processing` (ordered_steps, failure, idempotency),
  `concurrency_rules`, `turn_sequence` (end_turn / start_of_turn), `randomness`
  (seed / streams / replay), `victory_rules` (evaluation timing), `resignation`,
  `security_rules` (`action_rate_limit_required`, `client_values_ignored`),
  `replay_rules`, `enums` (action_types, validation_error_codes, event_types),
  `implementation_blockers`, `required_validation_tests`.
- `game-specification.md` — §4 (time model), §5 (turn flow), §23.1 (victory), §24
  (replay), §25 (concurrency), §29 (security), §34 (DoD), §35 (#23–#25, #27–#30).
- **Landed code composed:** engine `applyAction` / `validateAction` /
  `projectStateForPlayer` / `calculateVisibility` / `evaluateVictory` /
  `resolveStartOfTurn` / `createInitialMatchState` (+ `actions.ts`, `state.ts`,
  `events.ts`, `random.ts`); db `lockMatchForUpdate` / `assertStateVersion` /
  `StateVersionConflictError` / `recordIdempotentResult` / `appendEvents` /
  `insertPlayerEvents` / `persistMatchSnapshot` (`app/server/db`); auth `requireUser`
  / `requireMatchMembership`; lifecycle patterns (`deps`, `http`, `errors`,
  `rate-limit`, `ready`, `__tests__/fixtures`).
- `definition-of-ready.md` — the entry gate each ticket satisfies.
