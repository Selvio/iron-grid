# Iron Grid — M4 · Persistence & data model (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Backend / database contributors

> This is the **execution-detail** breakdown of milestone **M4** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the storage strategy and table schema are canonical
> in `database.md`; the request flow that drives these writes is `backend.md` §4;
> the entities each table stores are `domain-model.md`; the persistence-only
> contracts are `rules.yaml` → `concurrency_rules`, `replay_rules`,
> `data_versioning`, `security_rules`, `enums`; the exit gate is
> `game-specification.md` §34, `testing.md` §6, and `coding-standards.md` §11–§12.

---

# 1. Purpose

M4 opens **Phase 2 — Server**. It lays the **persistence foundation** the rest of
the server is built on: the PostgreSQL 17 + Drizzle ORM schema for every table in
`database.md` §5, forward-only Drizzle Kit migrations, and the **optimistic-
concurrency and versioning primitives** (`SELECT … FOR UPDATE`, the
`state_version` compare-and-increment, the append-only event sequence) that M7's
transactional pipeline will compose.

M4 is **schema and primitives only**. It creates the tables — including the
Auth.js adapter tables, `idempotency_keys` and `notification_jobs` — but does
**not** build the behavior that reads or writes them: the magic-link auth flow is
**M5**, the lifecycle API (`create`/`join`/`commander`/`ready`/`cancel`) is
**M6**, the transactional action pipeline is **M7**, and notification scheduling
and delivery are **M8**. This milestone gives those layers a validated, migratable
schema and the low-level locking/versioning building blocks they orchestrate.

Following the layer order (`architecture.md` §3, §11), the database is reached
only by the backend; `game-engine` and `game-data` never depend on it
(`architecture.md` §4). The authoritative battlefield state stays the engine's
serialized `state` snapshot on `matches.state` (`database.md` §3) — M4 stores that
shape, it does not reinterpret it.

**Current state** (starting point): the repo is the finished Phase-1 workspace —
`packages/game-engine` (all nine `engine_contract` functions, 196 tests green) and
`packages/game-data` (validated `GameData`). The root app is a bare Next.js 16 /
React 19 scaffold: **no Drizzle, Drizzle Kit, `@neondatabase/serverless`, Auth.js
or Resend installed**, no `app/server/db` module, no `drizzle.config.ts`, no
migrations directory. `database.md` specifies the target schema; nothing of it
exists in code yet.

---

# 2. Gates for M4

- **Entry (DoR):** each ticket is specified with goal, scope, files and
  acceptance; the entities it stores are defined in `domain-model.md` and the
  storage strategy in `database.md`. **No open §33 blocker applies to M4's
  scope.** The two columns that *reference* gated data — `match_players.commander_id`
  (→ `commanders.yaml`, gated by §33.1) and `matches.settings.dayLimit` /
  `game_data_version` — store only **opaque strings/JSON**; M4 needs no commander
  effect, no CO-meter charge and no day-limit score to persist them, so the §33.1
  and §33.2 blockers do **not** gate this milestone. Reference data is never in the
  database (`database.md` §11) — only the pinned version string is.
- **Exit (DoD):** the **persistence slice** of the Functional Definition of Done —
  the schema realizes every `database.md` §5 table with its constraints and
  indexes, migrations generate and apply forward-only, and the concurrency /
  append-only / version-pinning **primitives** are proven by integration tests
  (`testing.md` §6) — plus the code-change bar (`coding-standards.md` §11–§12:
  `tsc`/`next build`, `pnpm lint`, `cspell`). The **full** transactional pipeline,
  authorization, replay delivery and timeout suites belong to the layers that add
  them (M5–M8); M4 lands the schema and primitives they build on. The
  milestone-level DoD is in §5.

---

# 3. Cross-cutting decisions

- **Snapshot + relational split, exactly as specified** (`database.md` §3): the
  authoritative engine `state` is one JSONB column (`matches.state`); relational
  tables hold only what the database must query, index, join, lock or schedule
  independently. Selected fields are **mirrored** as indexed columns on `matches`
  (`state_version`, `active_player_id`, `day_counter`, `turn_deadline_at`) and are
  derived from the snapshot in the **same write** so they never drift. M4 defines
  the columns and the mirror-write helper; the pipeline that computes them from a
  `nextState` is M7.
- **Enums come from `rules.yaml` → `enums`, never invented** (`coding-standards.md`
  §4): `match_statuses`, `completion_reasons`, `event_types`, and the player
  role / notification-job / job-status enumerations are defined **once** from the
  canonical source and shared by schema and code. No status string is hardcoded at
  a call-site.
- **The database layer is server-only and one-directional** (`architecture.md`
  §4): the schema, client and query helpers live under `app/server/db` (Node.js
  runtime, `backend.md` §2) and may import Drizzle and the data/engine **types**;
  they are **never** imported by `game-engine` or `game-data`. A forbidden-import
  guard (mirroring the engine's) asserts the engine/data packages do not reference
  the db module.
- **IDs, time and randomness are injected, never ambient** — consistent with the
  engine's purity discipline carried up to the server. `random_seed` is a
  server-owned column written at activation (M6); M4 defines it and the
  determinism it will feed (`backend.md` §5) but generates no seed. Timestamps are
  `timestamptz`; the code that stamps them is the pipeline/lifecycle layer.
- **Append-only is enforced structurally, not by convention** (`database.md` §7,
  `security_rules`): `events` is written through an **insert-only** helper with no
  UPDATE/DELETE path in application code, and `unique(match_id, sequence)` with a
  contiguous-from-1 sequence guarantees order integrity. Authoritative `events`
  are private; only `player_events` are ever client-shaped.
- **Concurrency primitives are building blocks, not the pipeline** (`roadmap.md`
  §5, `database.md` §6, §10): M4 delivers `lockMatchForUpdate` (`SELECT … FOR
  UPDATE`), the `state_version` compare that raises the **typed conflict** with the
  current safe version and **no hidden state** (`conflict_response`), and the
  exactly-one increment — as reusable functions with their own tests. M7 composes
  them into `action_processing.ordered_steps`; M4 does not.
- **Test hermeticity has a documented boundary** (`testing.md` §6): schema shape,
  constraints, migration apply-forward and the version-compare/increment and
  version-pinning logic are tested against an **in-process Postgres** (PGlite) for
  speed, and `lockMatchForUpdate` is asserted functionally there (it reads the
  locked version). The **true row-lock contention** assertion — two simultaneous
  transactions where the second must block/observe the stale version under `FOR
  UPDATE` — needs **two real connections**, which PGlite (single-connection)
  cannot provide. **Decision:** that one two-connection serialization test is
  **deferred to M7**, where the transactional pipeline and the CI database
  infrastructure land; M4 ships the lock primitive and its functional test, not
  the contention test.

---

# 4. Tickets

## M4-T1 · Backend DB tooling, client & test harness
- **Goal:** install and wire the persistence toolchain and establish the
  server-only db module boundary (`database.md` §2, `architecture.md` §10–§11
  step 5).
- **Scope:**
  - Add root-app runtime deps: `drizzle-orm`, `@neondatabase/serverless`; dev
    deps: `drizzle-kit`, and the hermetic test-Postgres harness
    (`@electric-sql/pglite`). *(The real multi-connection harness for the deferred
    contention test is an M7 concern, §3.)*
  - `drizzle.config.ts` (schema path, `out` migrations dir, dialect `postgresql`,
    `DATABASE_URL` from env); the Drizzle **client** module (`app/server/db/client.ts`)
    over the Neon serverless driver on the **Node.js runtime**; typed env access
    for `DATABASE_URL` (no ambient reads elsewhere).
  - `pnpm` scripts: `db:generate` (emit SQL from schema), `db:migrate` (apply
    forward-only), `db:studio` (optional). Wire the DB integration tests into the
    existing Vitest run and the CI gate (`testing.md` §12).
  - The **forbidden-import guard**: a test asserting `packages/game-engine` and
    `packages/game-data` reference nothing under `app/server/db` (mirrors the
    engine's forbidden-dependency guard).
- **Files:** `drizzle.config.ts`, `app/server/db/client.ts`,
  `app/server/db/env.ts`, `app/server/db/index.ts`, root `package.json` (deps +
  scripts), test-harness helper (`app/server/db/__tests__/harness.ts`), guard test.
- **Acceptance:** `pnpm db:generate` runs against an empty schema without error;
  the client connects on the Node runtime; the harness spins up a disposable
  Postgres and tears it down per suite; the forbidden-import guard passes;
  `tsc`/`lint`/`cspell` green.
- **Dependencies:** M0 workspace; none from M1–M3 beyond the shared type packages.

## M4-T2 · Identity schema: `users` + Auth.js adapter tables
- **Goal:** the `users` table and the standard Auth.js Drizzle adapter tables
  (`database.md` §5.1; `backend.md` §7) — **schema only**, no auth flow (M5).
- **Scope:**
  - `users`: `id` (PK), `email` (unique, magic-link identity),
    `notification_preferences` (jsonb; **default** per `game-specification.md`
    §26.2 / `notifications` — invitation, turn started, turn reminder, match
    completed on; turn expired off), `created_at` (timestamptz).
  - The Auth.js **Drizzle adapter** tables — `accounts`, `sessions`,
    `verification_tokens` — defined by the adapter's canonical schema, not
    re-specified (`database.md` §5.1). M4 lands their DDL so M5 can wire the
    adapter without a migration scramble.
- **Files:** `app/server/db/schema/users.ts`,
  `app/server/db/schema/auth.ts` (adapter tables), export barrel update.
- **Acceptance:** `db:generate` emits the tables; `email` uniqueness and the
  adapter's required columns/constraints are present; a row round-trips through the
  client with the default notification preferences applied; no auth logic exists
  yet.
- **Dependencies:** M4-T1.

## M4-T3 · `matches` aggregate: columns, enums, mirrors & indexes
- **Goal:** the `matches` table — the aggregate root and authoritative-state
  carrier (`database.md` §5.2, §3; `domain-model.md` §6).
- **Scope:**
  - All `database.md` §5.2 columns: `id`, `status` (enum → `enums.match_statuses`),
    `map_id`, `settings` (jsonb — fog, turn deadline, day limit, victory
    conditions; opaque to M4), `invitation_code` (**unique**, six unambiguous
    alphanumerics, §3.3 — the column + constraint; generation is M6),
    `game_data_version` (pinned string), `random_seed`, `state_version` (integer),
    the **mirror** columns `active_player_id`, `day_counter`, `turn_deadline_at`,
    the `state` jsonb snapshot, `winner_player_id` (nullable),
    `completion_reason` (enum → `enums.completion_reasons`, nullable), and the
    `created_at`/`activated_at`/`completed_at` lifecycle timestamps.
  - **Indexes**: unique(`invitation_code`); (`status`); (`turn_deadline_at`) for
    the M8 deadline sweeper; (`active_player_id`).
  - The **mirror-write helper** contract: a single function that, given a match id
    and a serialized `nextState`, writes `state` and the four derived mirrors in
    the **same statement** (`database.md` §3). M4 defines and unit-tests the helper
    over a placeholder snapshot; M7 feeds it real engine output.
  - The `enums.match_statuses` / `enums.completion_reasons` shared enum definitions
    (§3).
- **Files:** `app/server/db/schema/matches.ts`,
  `app/server/db/schema/enums.ts`, `app/server/db/queries/matches.ts`
  (mirror-write helper), tests.
- **Acceptance:** the table generates with every column, both enums, and all four
  indexes; the mirror-write helper persists `state` and the derived mirrors
  atomically and never leaves them divergent from the snapshot in a test;
  `invitation_code` uniqueness rejects a duplicate.
- **Dependencies:** M4-T1; enums shared with T4/T5/T6.

## M4-T4 · `match_players`: membership, faction & commander uniqueness
- **Goal:** the `match_players` table holding per-match identity and setup
  (`database.md` §5.3; `domain-model.md` §7).
- **Scope:** `id` (PK), `match_id` (FK), `user_id` (FK, nullable until invitation
  accepted), `role` (enum host/guest), `faction_id` (Blue/Green/Red/Yellow),
  `commander_id` (reference string into `commanders.yaml` — **stored opaque**, no
  effect data, §2), `is_ready` (boolean). Constraints: **unique(`match_id`,
  `faction_id`)** and **unique(`match_id`, `commander_id`)** (§3.4 — no duplicate
  faction or commander per match); index(`user_id`) for a user's match list.
  Mutable per-turn values (funds, power meter, acted flags) are **not** here — they
  live in `matches.state` (`database.md` §5.3).
- **Files:** `app/server/db/schema/match-players.ts`, role enum in
  `enums.ts`, export barrel update, tests.
- **Acceptance:** the table generates with both composite uniqueness constraints
  and the `user_id` index; inserting a duplicate faction or duplicate commander in
  the same match is rejected; `user_id` accepts null; no per-turn gameplay column
  is present.
- **Dependencies:** M4-T1; M4-T3 (`match_id` FK).

## M4-T5 · Event store: `events` (append-only) + `player_events`
- **Goal:** the authoritative append-only event log and its per-player projections
  (`database.md` §5.4–§5.5, §7; `rules.yaml` → `replay_rules`).
- **Scope:**
  - `events`: `id` (PK), `match_id` (FK), `sequence` (integer, **per-match,
    contiguous from 1**), `type` (enum → `enums.event_types`), `payload` (jsonb —
    fully resolved values incl. `replay_rules.combat_event_fields`), `created_at`.
    Constraint **unique(`match_id`, `sequence`)**. Authoritative and **private** —
    never client-shaped.
  - `player_events`: `id`, `match_id` (FK), `player_id` (FK, the viewer),
    `sequence` (matches the authoritative sequence it derives from), `type`,
    `payload` (visibility-filtered), `created_at`. Index(`match_id`, `player_id`,
    `sequence`) — replay reads this table, never `events`.
  - The **insert-only append helper**: the only application path that writes
    `events`, exposing no UPDATE/DELETE, computing the next `sequence` under the
    match lock, and rejecting a gap or duplicate (§3, `security_rules`
    completed-match immutability enforced by absence of a mutation path). The
    projections are **written** by this layer but **computed** by the engine's
    `projectStateForPlayer` in M7 — M4 stores what it is handed.
- **Files:** `app/server/db/schema/events.ts`,
  `app/server/db/schema/player-events.ts`, event-type enum in `enums.ts`,
  `app/server/db/queries/events.ts` (append helper), tests.
- **Acceptance:** both tables generate with their constraints/index; the append
  helper assigns contiguous sequences from 1 and `unique(match_id, sequence)`
  rejects a duplicate or out-of-order insert; there is **no** code path that
  UPDATEs or DELETEs an event; `player_events` reads are keyed by
  (`match_id`, `player_id`, `sequence`).
- **Dependencies:** M4-T1; M4-T3 (`match_id`), M4-T4 (`player_id`).

## M4-T6 · Exactly-once & scheduling tables: `idempotency_keys` + `notification_jobs`
- **Goal:** the persistence for exactly-once mutations and durable notification
  scheduling (`database.md` §5.6–§5.7; `rules.yaml` → `action_processing.idempotency`,
  `notifications`) — **tables only**; the pipeline that writes idempotency (M7) and
  the scheduler that drains jobs (M8) come later.
- **Scope:**
  - `idempotency_keys`: `key` (client-supplied), `match_id` (FK),
    `committed_result` (jsonb — the original response to replay on a duplicate),
    `created_at`. Constraint **unique(`match_id`, `key`)**.
  - `notification_jobs`: `id` (PK), `match_id` (FK), `player_id` (FK, recipient),
    `type` (enum — `turn_reminder`, `turn_expired`, and the remaining
    `notifications.triggers`), `scheduled_at` (timestamptz), `sent_at`
    (nullable), `status` (enum pending/sent/cancelled). Index(`status`,
    `scheduled_at`) for the M8 scheduler. Never gameplay-authoritative.
  - A tiny **idempotency lookup/insert helper** contract (return
    `committed_result` on a duplicate key, else record) — defined and unit-tested
    here, invoked by M7's pipeline.
- **Files:** `app/server/db/schema/idempotency-keys.ts`,
  `app/server/db/schema/notification-jobs.ts`, the two enums in `enums.ts`,
  `app/server/db/queries/idempotency.ts`, tests.
- **Acceptance:** both tables generate with their constraints/index; a second
  insert of the same (`match_id`, `key`) returns the stored `committed_result`
  rather than duplicating; `notification_jobs` supports the (`status`,
  `scheduled_at`) scan; the notification enums match `notifications.triggers`.
- **Dependencies:** M4-T1; M4-T3 (`match_id`), M4-T4 (`player_id`).

## M4-T7 · Migrations, concurrency & version-pinning primitives
- **Goal:** the checked-in forward-only migration set and the optimistic-
  concurrency / append-only / data-version primitives the transactional pipeline
  will compose (`database.md` §6, §8–§10; `roadmap.md` §5; `rules.yaml` →
  `concurrency_rules`, `data_versioning`).
- **Scope:**
  - **Migrations**: the per-slice migrations generated alongside T2–T6 (Drizzle
    Kit, checked in) apply **forward-only** in a clean DB; T7 verifies that from
    an empty database and adds the integrity note. Encode the **integrity
    rule** (`database.md` §9, `data_versioning.migration_of_active_match`):
    migrations may add columns/tables but must not rewrite an active match's
    `state` semantics or its pinned `game_data_version`; add a lint/README note and
    an apply-in-order test.
  - **Concurrency primitives** (`database.md` §6): `lockMatchForUpdate(tx, id)`
    (`SELECT … FROM matches WHERE id = $1 FOR UPDATE`); a
    `assertStateVersion(current, expected)` that raises the **typed conflict**
    carrying the current safe `state_version` and **no hidden state**
    (`conflict_response`); and `incrementStateVersion` (exactly +1, in the commit
    write). These are standalone, tested functions — **not** wired into an endpoint
    (that is M7).
  - **Version-pinning primitive** (`database.md` §8): the write path that sets
    `game_data_version` at activation and the read helper that returns it; a guard
    that the value is immutable for an active match.
- **Files:** `drizzle/` (generated migration SQL), `app/server/db/queries/concurrency.ts`,
  `app/server/db/queries/versioning.ts`, migration-integrity note in
  `app/server/db/README.md`, tests (PGlite for schema/version/lock-primitive;
  the two-connection contention test deferred to M7, §3).
- **Acceptance:** the migrations apply forward-only against an empty database and
  produce the full schema; `assertStateVersion` rejects a stale
  `expectedStateVersion` with the typed conflict and leaks no hidden state;
  `incrementStateVersion` advances by exactly one; `lockMatchForUpdate` reads the
  locked version (functional test); `game_data_version` cannot be changed once set
  for an active match. *(The two-connection row-lock contention test is deferred
  to M7, §3.)*
- **Dependencies:** M4-T2 … M4-T6 (all tables must exist to migrate and lock).

**Ordering:** M4-T1 → { M4-T2 ∥ M4-T3 ∥ M4-T4 ∥ M4-T5 ∥ M4-T6 } → M4-T7.
(T2–T6 are independent schema slices on T1's tooling, sharing only the `enums`
module; T7 generates the migration and the locking/versioning primitives once
every table exists. T4/T5/T6 reference `matches`/`match_players` FKs from T3/T4
but can be authored in parallel and reconciled at migration time.)

---

# 5. Definition of Done for M4

M4 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and
   `pnpm build` are all green, and `pnpm db:generate` / `pnpm db:migrate` apply the
   checked-in migration forward-only against an empty database.
2. The Drizzle schema realizes **every** `database.md` §5 table — `users` + the
   Auth.js adapter tables, `matches` (with mirrors), `match_players`, `events`,
   `player_events`, `idempotency_keys`, `notification_jobs` — with the specified
   columns, enums (from `rules.yaml` → `enums`), constraints and indexes.
3. The **primitives** are implemented and tested: `lockMatchForUpdate`, the
   `state_version` compare→typed-conflict and exactly-one increment
   (`concurrency_rules`), the insert-only append helper with contiguous
   per-match sequence (`replay_rules`), the idempotency lookup/insert, and the
   `game_data_version` pin (`data_versioning`) — none of them wired into an
   endpoint yet.
4. The database layer is server-only and one-directional: the forbidden-import
   guard proves `game-engine` and `game-data` reference nothing under
   `app/server/db`; reference data stays in `02-data/*.yaml` with only the pinned
   version string persisted (`database.md` §11).
5. Integration tests (`testing.md` §6) cover: schema round-trips, the composite
   uniqueness constraints (faction/commander per match, `match_id`+`sequence`,
   `match_id`+`key`), append-only enforcement (no UPDATE/DELETE path), the
   stale-version typed conflict and version-pin immutability, and the
   `lockMatchForUpdate` functional read — green under CI. *(The two-connection
   row-lock contention test is deferred to M7, §3.)*
6. Scope stays inside persistence: **no** auth flow (M5), **no** lifecycle or
   action endpoints (M6/M7), **no** notification scheduling/delivery (M8); those
   layers find a validated schema and the primitives, and add their behavior on
   top. No gated data is faked — `commander_id`, `settings.dayLimit` and
   `game_data_version` are stored as opaque strings/JSON.

---

# 6. Cross-references

- `roadmap.md` — M4's place in the sequence (§5), the layered strategy (§2), and
  the parallel track with M2–M3 (§7); the §33 blocker map (§6) — none gate M4.
- `database.md` — the canonical storage strategy (§3), table schema (§5),
  concurrency/locking (§6), append-only store (§7), version pinning (§8),
  migrations (§9), and the transaction boundary M7 will realize (§10).
- `backend.md` — §2 runtime/framework, §4 the pipeline these primitives compose
  into, §7 auth (M5 consumer of the adapter tables), §8 concurrency, §9 deadlines
  (M8 consumer of `notification_jobs`), §11 version pinning.
- `domain-model.md` — the entities each table stores (User §5, Match §6,
  MatchPlayer §7, Event §12).
- `rules.yaml` → `concurrency_rules`, `replay_rules`, `data_versioning`,
  `security_rules`, `action_processing.idempotency`, `notifications`, `enums`.
- `architecture.md` — §4 the package boundary and forbidden dependencies, §10–§11
  technology mapping and the migration-from-scaffold steps.
- `testing.md` — §6 the backend/integration test layer and its obligations; §12
  the Vitest/CI wiring.
- `definition-of-ready.md` — the entry gate each ticket satisfies.
- `game-specification.md` — §25 (concurrency), §26 (notifications), §29
  (security/immutability), §31.2 (data-version pinning), §34 (Definition of Done),
  §35 (acceptance scenarios the backend suite anchors to).
