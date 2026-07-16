# Iron Grid — M6 · Match lifecycle API (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Backend / lifecycle contributors

> This is the **execution-detail** breakdown of milestone **M6** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the API surface it exposes is `backend.md` §3, the
> pipeline head it composes is §4, concurrency is §8 and version pinning §11; the
> lifecycle state machine is `domain-model.md` §6.1 and the entities are §6–§7; the
> canonical lifecycle contract is `rules.yaml` → `match_lifecycle` (with
> `commander_rules`, `concurrency_rules`, `data_versioning`, `security_rules`); the
> tables it drives were landed in M4 (`database.md` §5.2–§5.3) and the auth
> primitives it composes in M5 (`backend.md` §7). The exit gate is
> `game-specification.md` §3, §34, `testing.md` §6 and `coding-standards.md` §11–§12.

---

# 1. Purpose

M6 continues **Phase 2 — Server**. On M4's validated schema + persistence /
concurrency / versioning primitives and M5's identity, session and authorization
layer, it builds the **match lifecycle API**: the endpoints that carry a match
from creation to its first live turn — `create`, `join`, `commander`, `ready`,
`cancel` — plus invitation codes, the **ready → activate** transition, and
**data-version pinning at activation** (`roadmap.md` §5, `backend.md` §3, §11).

M6 is the **first milestone to compose M5's primitives into real endpoints**:
`requireUser` authenticates every call, `requireMatchMembership` authorizes the
member-only transitions, and the M4 primitives (`lockMatchForUpdate`,
`pinGameDataVersion`, `persistMatchSnapshot`, `appendEvents` / `insertPlayerEvents`)
run inside the activation transaction. It stops at the **pre-gameplay** boundary:
the transactional **action pipeline** that mutates live state per turn
(`create`/`move`/`attack`/… with `expectedStateVersion` optimistic concurrency) is
**M7**; notification **scheduling / delivery** is **M8**; the branded lifecycle UI
is **M9**. M6 lands the lifecycle transitions, the invitation flow, the activation
that produces the first authoritative snapshot, and the authorization wiring those
layers build on.

M6 is **lifecycle mechanism only**. Two pieces of **approved game content it must
not invent** are deferred (§3, §E of the authoring brief): the **real commander
roster** (§33.1 — names, factions, passive/power effects, meter costs) and an
**official playable map**. Both files forbid fabricated values (`commanders.yaml`
"Implementation agents must not invent those values"; `maps.yaml` "No playable
official map is invented here"). M6 therefore builds the selection and activation
**mechanism against placeholder / test fixtures** (`roadmap.md` §5 "the UI can use
placeholder commanders until then"), exactly as M3 built the commander mechanism
data-driven and inert. Populating the real roster (the §33.1 ADR) and approving
official maps are **design-gated follow-ups**, tracked in §6, not implemented here.

**Current state** (starting point): the finished M5 workspace — the full
`app/server/db` schema/queries/harness, the `app/server/auth` layer
(`requireUser`, `requireMatchMembership`, magic-link sign-in) and the
`app/server/account` endpoint. The `matches` / `match_players` tables exist with
`invitation_code` (unique), `game_data_version`, `state_version`, the status enum
and the faction/commander unique constraints, but **no lifecycle endpoint, no
invitation-code generator, no activation path and no initial-state builder** exist
yet. `game-engine` exposes the nine contract functions (`applyAction`,
`resolveStartOfTurn`, `evaluateVictory`, projection, …) but **no match-setup /
initial-state builder** — M6 adds one (§3). `game-data` loads the YAML set but the
`maps` list is empty (schema only) and `commanders.yaml` is `design-blocked`.

---

# 2. Gates for M6

- **Entry (DoR):** each ticket is specified with goal, scope, files and
  acceptance; the endpoints it exposes are `backend.md` §3, the state machine it
  drives is `domain-model.md` §6.1, the tables exist from M4 and the auth
  primitives from M5. **§33.1 does apply to M6** — unlike M4/M5. It gates **real**
  commander selection (`roadmap.md` §6, line for §33.1: "data/selection in M6")
  and `activate_power` / the power meter (`implementation_blockers` → `commander-data`).
  Its JIT resolution — the commander ADR + `commanders.yaml` population — is a
  **design-gated follow-up** (§6); the selection **mechanism** is **unblocked** and
  built against placeholder commander fixtures (T1). Likewise no official map is
  approved yet, so activation runs against a **test map fixture** (T1); official
  maps are design-gated. No other §33 blocker applies (`day_limit` scoring §33.2
  is stored but not scored — M8/later; special-terrain/property art §33.3–§33.4 do
  not gate lifecycle mechanism).
- **Exit (DoD):** the **lifecycle slice** of the Functional Definition of Done
  (`game-specification.md` §3, §34) — a host creates a match with a unique
  unambiguous invitation code; a guest joins by code; both select
  commander/faction; both ready; the match **activates atomically** with a pinned
  `game_data_version`, a server seed, the initial snapshot and the first
  `turn_started`; a pre-active match can be cancelled — **against the test
  fixtures**, plus the code-change bar (`coding-standards.md` §11–§12). Real
  content, the full action pipeline (M7) and the branded UI (M9) are out of scope.
  The milestone-level DoD is §5.

---

# 3. Cross-cutting decisions

- **Lifecycle mutations are server-only and one-directional** (`architecture.md`
  §4, `backend.md` §2): the lifecycle handlers live under `app/server` on the
  Node.js runtime (they hold row locks and write transactionally) and compose the
  db + auth layers; `game-engine` / `game-data` never import them (the M5-extended
  forbidden-import guard already covers `server/(db|auth|account)` and is extended
  to the lifecycle module).
- **Authorize by the right primitive per endpoint** (`backend.md` §7): `create`
  and `join` use **`requireUser` only** — `create` has no match yet (the caller
  becomes host) and `join`'s guest is **not yet a member** (`match_players.user_id`
  is null until acceptance, so `requireMatchMembership` would reject them); `join`
  authorizes by **invitation code**. `commander`, `ready` and `cancel` use
  `requireUser` + `requireMatchMembership` (both players are accepted members by
  then). Getting this wrong would either lock out legitimate joiners or leak the
  member-only transitions.
- **`create` publishes at creation; there is no separate publish endpoint.** The
  API surface (`backend.md` §3) has no publish step, yet
  `invitation.status_after_publish: "waiting_for_opponent"`. Decision: `create`
  inserts the match (momentarily `draft` per `creation.initial_status`), generates
  the invitation code, and the same transaction leaves it durably in
  **`waiting_for_opponent`** — creation *is* publication in the MVP. `draft` is a
  reserved status with no owning endpoint.
- **Invitation codes use the unambiguous charset** (`match_lifecycle.invitation`,
  spec §3.3, `database.md` §5.2): six characters, alphanumeric **minus**
  `ambiguous_characters_forbidden: ["0","O","1","I"]`, generated at creation and
  stored on `matches.invitation_code` (the landed `uniqueIndex`), with
  collision-retry against the unique index. The generator is new in M6.
- **Lifecycle concurrency is lock-based, not version-based** (`backend.md` §8,
  `concurrency_rules`): lifecycle transitions serialize via `lockMatchForUpdate` +
  a **status precondition check** under the lock (reject double-accept,
  double-activation, cancel-after-active), but they do **not** carry the client
  `expectedStateVersion` — that optimistic-concurrency discipline is for the
  gameplay action pipeline (M7). `state_version` stays `0` pre-activation and is
  initialized from the initial snapshot's `meta.stateVersion` at activation.
- **New typed lifecycle error codes are additive** (`enums.validation_error_codes`):
  the enum is gameplay-action-oriented and lacks lifecycle codes. M6 reuses
  `not_match_player` (membership) and `match_already_completed` where they fit, and
  **adds** the lifecycle codes it needs — `invalid_invitation_code`,
  `match_not_joinable`, `commander_unavailable`, `invalid_lifecycle_transition`,
  `players_not_ready` — as a **forward-only additive extension** to
  `enums.validation_error_codes`, mirrored by typed errors (like
  `MembershipForbiddenError`) that the endpoint layer maps to status codes. The
  additive enum change bumps no gameplay semantics.
- **Match setup is engine logic, added to the engine** (`architecture.md` §4): all
  game rules live in `game-engine`, so building the initial authoritative
  `MatchState` from a map + roster + seed is a **new pure engine function**
  (`createInitialMatchState`), not server code. It operates on the T1 test map now
  and real maps later; it stays pure over `(map, players, settings, seed, gameData)`
  with randomness only from the injected source (`engine_contract`).
- **Placeholder content until the design gates clear** (`roadmap.md` §5): T1 lands
  a placeholder commander/faction set and a test map fixture that the mechanism and
  its tests run against. `commander_id` / `faction_id` stay **opaque references**
  (`match-players.ts`), so no real commander value is invented. The §33.1 ADR +
  real `commanders.yaml` and official maps are design-gated (§6).
- **Rate limits land with their endpoints** (`security_rules.invitation_rate_limit_required`,
  deferred from M5 §3): `create` and `join` apply invitation rate limiting; the
  gameplay `action_rate_limit_required` is M7.

---

# 4. Tickets

## M6-T1 · Placeholder content fixtures & the initial-state builder
- **Goal:** the shared, **non-official** fixtures the lifecycle mechanism and its
  tests run against, and the pure engine function that builds the first snapshot —
  so T2–T6 need no approved game content (`roadmap.md` §5; `architecture.md` §4).
- **Scope:**
  - A **placeholder commander/faction set** (four commander slots, four factions
    Blue/Green/Red/Yellow, opaque ids, **inert** — no real names/effects/costs) as
    a test fixture, honoring `commander_rules` shape (`one_per_faction`,
    `duplicate_selection_allowed: false`). No value is written into
    `commanders.yaml` (that is the design-gated §33.1 ADR, §6).
  - A **test map fixture** (20×16 per `maps.yaml` constraints, or a smaller
    clearly-non-official harness map) with `player_starts`, `starting_units`,
    `starting_funds`, headquarters properties and terrain — enough to activate and
    run one start-of-turn. Not added to `maps.yaml`; marked test-only.
  - `createInitialMatchState(...)` — a **pure `game-engine` function** producing the
    initial `MatchState` (units placed, properties owned, funds, `activePlayerId`,
    `dayCounter = 0`, `meta.stateVersion`) from the map + accepted roster + settings
    + injected seed (`domain-model.md` §6 "activation initializes `dayCounter` to 0";
    `match_start.starting_{units,funds}_source: "maps.yaml"`).
- **Files:** engine setup module + export in `packages/game-engine/src`, a test map
  + commander fixture under the engine/test fixtures, unit tests for the builder.
- **Acceptance:** `createInitialMatchState` deterministically returns a valid
  `MatchState` for the fixture (units/properties/funds placed, `dayCounter = 0`,
  a populated `meta.stateVersion`); `resolveStartOfTurn` runs on it without error;
  the builder is pure (no I/O, randomness only from the injected source);
  `tsc`/`lint`/tests green.
- **Dependencies:** M2/M3 engine state model; no design gate (fixtures are non-official).

## M6-T2 · Invitation-code generator & create endpoint (`POST /api/matches`)
- **Goal:** create a match in `waiting_for_opponent` with a unique unambiguous
  invitation code and a host player row (`backend.md` §3; `match_lifecycle.creation`,
  `invitation`; §3 decision on publish).
- **Scope:**
  - The **generator**: six chars from the alphanumeric charset minus `0/O/1/I`,
    with collision-retry against `matches_invitation_code_key`.
  - `POST /api/matches` — `requireUser`; validate the host settings against
    `creation.allowed_configuration` (`map_id`, `fog_enabled`, `turn_deadline_option`,
    `day_limit`, victory conditions) and reject `fixed_configuration`; insert the
    `matches` row (status `waiting_for_opponent`, code, settings) and the host
    `match_players` row (`role='host'`, `user_id`, `creation.host_is_player_one`);
    return the match id + code. **Invitation rate limit** applied.
  - Typed errors: invalid settings / unknown `map_id` → `invalid_lifecycle_transition`
    (or a settings-specific code); unauthenticated → 401.
- **Files:** lifecycle module (`app/server/lifecycle/…`), `app/api/matches/route.ts`,
  the generator + settings validator, tests (PGlite).
- **Acceptance:** create returns a match in `waiting_for_opponent` with a 6-char
  unambiguous code and a host row; codes are unique under retry; invalid/fixed
  settings rejected; unauthenticated → 401; no code contains `0/O/1/I`.
- **Dependencies:** M5-T3 (`requireUser`), M4 `matches`/`match_players`.

## M6-T3 · Join endpoint (`POST /api/matches/:id/join`)
- **Goal:** a guest accepts an invitation by code and the match moves to
  `commander_selection` (`backend.md` §3; `match_lifecycle.invitation`; spec §3.3).
- **Scope:**
  - `POST /api/matches/:id/join` — `requireUser` **+ invitation-code check** (not
    membership). `lockMatchForUpdate`; verify the match is `waiting_for_opponent`
    and the guest slot is open (no accepted guest); reject the host re-joining and
    a second guest (`match_not_joinable`); set the guest `match_players` row
    (`user_id`, `role='guest'`); transition `waiting_for_opponent` →
    `commander_selection`. **Invitation rate limit** applied.
  - Typed errors: wrong/absent code → `invalid_invitation_code`; already full /
    wrong status → `match_not_joinable`; unauthenticated → 401.
- **Files:** `app/api/matches/[id]/join/route.ts`, lifecycle handler, tests.
- **Acceptance:** a valid code by a new user accepts them as guest and moves to
  `commander_selection`; a bad code → `invalid_invitation_code`; a second guest or
  a join on a non-`waiting_for_opponent` match → `match_not_joinable`; concurrent
  joins do not double-accept (lock); unauthenticated → 401.
- **Dependencies:** M6-T2; M5-T3.

## M6-T4 · Commander-selection endpoint (`POST /api/matches/:id/commander`)
- **Goal:** each accepted member selects a commander + faction, gating entry to
  `ready_check` (`backend.md` §3; `match_lifecycle.commander_selection`,
  `commander_rules`; spec §3.4).
- **Scope:**
  - `POST /api/matches/:id/commander` — `requireUser` + `requireMatchMembership`;
    `lockMatchForUpdate`; enforce `first_picker_selection: "server_random"`,
    `second_picker_sees_first_choice`, no duplicate commander/faction (the landed
    `match_players_match_{faction,commander}_key` unique constraints are the guard);
    set `faction_id` / `commander_id` (opaque, validated against the **placeholder
    roster**, T1); when **both** members have valid selections, gate to `ready_check`.
  - Typed errors: taken commander/faction or invalid id → `commander_unavailable`;
    selection out of phase → `invalid_lifecycle_transition`; non-member → 403.
- **Files:** `app/api/matches/[id]/commander/route.ts`, lifecycle handler, tests.
- **Acceptance:** a member sets a valid commander/faction; a duplicate is rejected
  (`commander_unavailable`); the server-random first picker is honored; both valid
  selections move the match to `ready_check`; a non-member → 403; selection outside
  `commander_selection` → `invalid_lifecycle_transition`.
- **Dependencies:** M6-T3; M5-T4 (`requireMatchMembership`); T1 (placeholder roster).

## M6-T5 · Ready check & the activation transition (`POST /api/matches/:id/ready`)
- **Goal:** both members confirm ready and the match **activates atomically** with
  a pinned data version, a server seed and the first authoritative snapshot
  (`backend.md` §3, §8, §11; `match_lifecycle.ready_check`, `match_start`,
  `data_versioning`; `turn_sequence.start_of_turn`; spec §3.5–§3.6).
- **Scope:**
  - `POST /api/matches/:id/ready` — `requireUser` + `requireMatchMembership`; set
    `match_players.is_ready = true`; when **both** ready (`both_players_required`,
    `auto_start_when_both_ready`) run activation **in one transaction** under
    `lockMatchForUpdate` (prevents double-activation):
    1. `first_player_selection: "server_random"`; generate the server `random_seed`
       (spec §12.6).
    2. `createInitialMatchState(...)` (T1) from the map + roster + settings + seed;
       `dayCounter = 0`.
    3. `pinGameDataVersion(db, matchId, gameData.version)` (§D; the pin is immutable
       thereafter — a re-pin throws the documented error).
    4. `persistMatchSnapshot(db, matchId, state)` — mirrors `status='active'`,
       `activePlayerId`, `dayCounter`, `turnDeadlineAt`, `stateVersion`; set
       `activated_at`.
    5. run first-turn start processing (`resolveStartOfTurn`), append the
       `match_started` + `turn_started` events (`appendEvents`) and their
       projections (`insertPlayerEvents`).
  - Typed errors: ready outside `ready_check` → `invalid_lifecycle_transition`;
    activation attempted before both ready → `players_not_ready`; non-member → 403.
- **Files:** `app/api/matches/[id]/ready/route.ts`, the activation transaction
  handler, tests (PGlite: single-ready, both-ready→active, no double-activate).
- **Acceptance:** the first ready sets the flag and leaves status `ready_check`; the
  second ready activates atomically — `status='active'`, `game_data_version`
  pinned, `random_seed` set, `state` populated, `activated_at` set,
  `match_started` + `turn_started` events + projections written, `stateVersion`
  from the snapshot; a concurrent second activation is prevented by the lock and
  does not re-pin; ready outside `ready_check` → typed error; non-member → 403.
- **Dependencies:** M6-T4; M6-T1 (builder); M4-T7 (lock, pin, snapshot, events).

## M6-T6 · Cancel endpoint (`POST /api/matches/:id/cancel`)
- **Goal:** cancel a match before activation (`backend.md` §3;
  `match_lifecycle.cancellation`; `domain-model.md` §6.1).
- **Scope:**
  - `POST /api/matches/:id/cancel` — `requireUser` + `requireMatchMembership`;
    `lockMatchForUpdate`; verify a **pre-active** status
    (`draft`/`waiting_for_opponent`/`commander_selection`/`ready_check`); transition
    → `cancelled`; reject an `active`/`completed`/`cancelled` match
    (`allowed_after_active: false`).
  - Typed errors: cancel on an active/finished match → `invalid_lifecycle_transition`
    (or `match_already_completed`); non-member → 403.
- **Files:** `app/api/matches/[id]/cancel/route.ts`, lifecycle handler, tests.
- **Acceptance:** a member cancels a pre-active match → `cancelled`; cancel on an
  `active`/`completed`/`cancelled` match is rejected with the typed error; a
  non-member → 403; the transition is serialized under the lock.
- **Dependencies:** M6-T2; M5-T4. Parallel with T3–T5.

**Ordering:** M6-T1 → M6-T2 → { M6-T3 → M6-T4 → M6-T5 } ∥ M6-T6.
(T1's fixtures + builder underpin activation and the selection mechanism; T2's
create path underpins everything; the guest→commander→ready chain is sequential;
T6 depends only on T2's create path and can proceed in parallel.)

---

# 5. Definition of Done for M6

M6 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and `pnpm build`
   are green, and `pnpm db:generate` / `pnpm db:migrate` report the expected schema
   (no unintended migration; any additive change — e.g. new
   `enums.validation_error_codes` — is a single forward-only migration if it
   touches the DB, and applies cleanly).
2. **Create** issues a match in `waiting_for_opponent` with a unique, unambiguous
   6-char invitation code (`0/O/1/I` excluded) and a host `match_players` row,
   `requireUser`-authenticated, host settings validated against
   `creation.allowed_configuration` (`backend.md` §3; spec §3.2–§3.3).
3. **Join** accepts a guest by invitation code (not membership),
   `waiting_for_opponent` → `commander_selection`, serialized so two guests cannot
   both accept (spec §3.3).
4. **Commander** selection (`requireMatchMembership`) enforces server-random first
   picker, no duplicate commander/faction (DB unique constraints), and gates to
   `ready_check` when both are valid — against the **placeholder roster** (spec §3.4).
5. **Ready → activate**: both-ready triggers an **atomic** activation under the row
   lock — `status='active'`, `game_data_version` **pinned** (immutable),
   `random_seed` set, the initial snapshot persisted, `match_started` + `turn_started`
   events + projections written, `activated_at` set — with **no double-activation**
   (`backend.md` §8, §11; `match_start`; spec §3.5–§3.6).
6. **Cancel** transitions a pre-active match to `cancelled` and rejects an active or
   finished one (`cancellation.allowed_after_active: false`; spec §3).
7. Authorization is correct per endpoint: `requireUser` on all; `requireMatchMembership`
   on `commander`/`ready`/`cancel`; `create`/`join` **not** membership-gated;
   invitation rate limiting on `create`/`join` (`security_rules`).
8. Integration tests (`testing.md` §6, PGlite) cover: code generation/uniqueness,
   create, join (accept + reject bad code / full), commander (select + duplicate +
   phase gate), the both-ready activation (snapshot + pin + events + no
   double-activate), and cancel (pre-active + reject active).
9. Scope stays inside lifecycle mechanism: **no** gameplay action pipeline (M7),
   **no** notification scheduling/delivery (M8), **no** branded UI (M9); the
   **§33.1 commander ADR + real `commanders.yaml`** and **official approved maps**
   remain design-gated (§6) and the mechanism runs on the T1 fixtures.

---

# 6. Deferred design gates (not implemented in M6)

These require approved design that agents must not fabricate; M6 builds the
mechanism around them and they are resolved separately before real play:

- **§33.1 commander ADR + `commanders.yaml` population** — names, factions, passive
  and power effects, meter costs (`roadmap.md` §5–§6; spec §33.1;
  `commander_rules.hardcoded_commander_names_forbidden`,
  `meter.implementation_blocked_until_commanders_yaml`). Until then the selection
  mechanism (T4) runs on placeholder commander fixtures; `activate_power` / the
  power meter remain blocked (`implementation_blockers` → `commander-data`).
- **Official playable map(s)** — an approved balanced 20×16 layout in `maps.yaml`
  (`maps.yaml` "No playable official map is invented here"; spec §33). Until then
  activation (T5) runs on the T1 test map fixture.
- **`day_limit` scoring** (§33.2), **special-terrain / property art** (§33.3–§33.4):
  stored and rendered later; not a lifecycle-mechanism gate.

---

# 7. Cross-references

- `roadmap.md` — §2 (JIT design-blocker strategy, layered order), §5 (M6 entry and
  its JIT commander note), §6 (the §33.1 blocker → "data/selection in M6"), §7 (M9
  consumes this API).
- `backend.md` — §2 (Node.js runtime), §3 (the five lifecycle endpoints), §4 (the
  `authenticate_player` / `authorize_match_membership` pipeline head M6 composes; the
  full action pipeline is M7), §7 (authz), §8 (concurrency / row lock), §11
  (data-version pinning), §12 (security — invitation rate limit, completed-match
  immutability).
- `database.md` — §5.2 (`matches`: `invitation_code` unique, `game_data_version`,
  `state_version`, status/mirrors), §5.3 (`match_players`: role, faction/commander
  uniqueness, `is_ready`), §6 (optimistic concurrency / row lock), §8 (version
  pinning immutability).
- `domain-model.md` — §6 + §6.1 (Match entity + lifecycle state machine + the
  `dayCounter = 0` activation convention), §7 (MatchPlayer, faction/commander
  invariant), §14–§15 (invariants, `gameDataVersion` fixed at activation, monotonic
  `stateVersion`).
- `rules.yaml` — `match_lifecycle` (`creation`, `invitation`, `commander_selection`,
  `ready_check`, `match_start`, `cancellation`), `commander_rules`,
  `concurrency_rules`, `data_versioning`, `security_rules`
  (`invitation_rate_limit_required`); `enums.match_statuses`,
  `enums.validation_error_codes` (extended additively), `enums.event_types`
  (`match_started`, `turn_started`); `MATCH_PLAYER_ROLES`.
- `game-specification.md` — §3.1 (states), §3.2 (creation), §3.3 (invitation/join),
  §3.4 (commander selection), §3.5 (ready check), §3.6 (first turn), §12.6 (server
  seed), §31.2 (data-version pinning), §33.1 (commander blocker), §34 (DoD).
- **Landed code composed:** `app/server/auth/session.ts` (`requireUser`),
  `app/server/auth/membership.ts` (`requireMatchMembership`),
  `app/server/db/queries/{concurrency,versioning,matches,events,idempotency}.ts`
  (`lockMatchForUpdate`, `pinGameDataVersion`, `persistMatchSnapshot`,
  `appendEvents` / `insertPlayerEvents`, `recordIdempotentResult`),
  `app/server/db/schema/{matches,match-players,enums}.ts`;
  `packages/game-data` (`GameData.version` — the pinned value).
- `definition-of-ready.md` — the entry gate each ticket satisfies.
