# Iron Grid — Database

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Backend, database, QA, AI contributors

> This document maps the domain model to persistence: PostgreSQL 17 + Drizzle ORM
> (deployed on Neon). It describes **how entities are stored**, not what they mean.
>
> Entity **meaning** is canonical in `domain-model.md`. The transactional rules
> this schema serves are canonical in `rules.yaml` (`action_processing`,
> `concurrency_rules`, `replay_rules`, `data_versioning`) and
> `game-specification.md` §25, §29, §31. The request flow that drives these writes
> is in `backend.md` §4. This document references those; it does not restate them.

---

# 1. Scope

Covers: the storage strategy for authoritative state, the table schema, and the
persistence-only concerns — optimistic concurrency, append-only events,
data-version pinning, idempotency and migrations.

Does **not** cover: gameplay rules, the engine, API routes (→ `backend.md`), or
reference-data definitions (→ `02-data/*.yaml`).

---

# 2. Technology

- **PostgreSQL 17**, hosted on **Neon** (serverless driver
  `@neondatabase/serverless`).
- **Drizzle ORM** for the schema and typed queries; **Drizzle Kit** for
  migrations.
- Mutations run on the Node.js runtime inside transactions with row locks
  (`backend.md` §2, §8).

Only the backend touches the database. `game-engine` and `game-data` never depend
on it (`architecture.md` §4).

---

# 3. State persistence strategy

The pure engine operates on a single in-memory authoritative `state` object and
returns a complete `nextState` on every action (`architecture.md` §5, §7). The
schema follows that shape:

- **Authoritative battlefield state is stored as a JSONB snapshot** on the match
  (`matches.state`). This is the serialized engine `state`: units, property
  instances, terrain-object overlays, per-player funds and power meters, and turn
  context. One read loads it, the engine transforms it, one write persists it —
  matching the atomic pipeline.
- **Relational tables hold everything the database must query, index, join, lock
  or schedule independently of the engine:** identity, membership, lifecycle,
  events, idempotency and notification jobs.
- **Selected fields are mirrored** as indexed columns on `matches` (e.g.
  `state_version`, `active_player_id`, `day_counter`, `turn_deadline_at`) so the
  backend can lock, filter and schedule without deserializing the snapshot. The
  mirrors are derived from the snapshot and written in the **same transaction**,
  so they never drift.

Rationale: per-unit relational churn on every move would be costly and would split
the authoritative state across many rows, complicating the single-transaction,
single-version guarantee. The append-only `events` table remains the durable,
queryable record of *what happened*; the snapshot is the current *result*.

> Alternative considered: a fully normalized `units` / `properties` schema. Rejected
> for the MVP because it fragments the atomic state the engine already produces as
> one object. It can be revisited if per-entity querying becomes a requirement.

---

# 4. Schema overview

```text
users ──1:N── match_players ──N:1── matches
  │                                    │ 1:N
  │ (Auth.js)                          ├── events            (authoritative, append-only)
  ├── accounts                         ├── player_events     (per-player projections)
  ├── sessions                         ├── idempotency_keys
  └── verification_tokens              └── notification_jobs
```

Reference data (units, terrain, maps, …) is **not** in the database; only the
pinned version string is (§8, §10).

---

# 5. Tables

Columns below are the significant ones; each maps to a `domain-model.md` entity.
Types are indicative (Drizzle/Postgres).

## 5.1 `users` and Auth.js tables

Maps `domain-model.md` §5 (User).

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `email` | text | Unique. Magic-link identity. |
| `notification_preferences` | jsonb | Per-type toggles (§8, spec §26.2). |
| `created_at` | timestamptz | |

`accounts`, `sessions` and `verification_tokens` are the standard **Auth.js
Drizzle adapter** tables (`backend.md` §7). They are defined by the adapter and
not re-specified here.

## 5.2 `matches`

Maps `domain-model.md` §6 (Match, aggregate root).

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `status` | text (enum) | Match status (`rules.yaml` `enums.match_statuses`). |
| `map_id` | text | Reference into `maps.yaml`. |
| `settings` | jsonb | Fog on/off, turn deadline, day limit, victory conditions (spec §3.2). |
| `invitation_code` | text | **Unique**. Six alphanumeric chars, no ambiguous characters (§3.3). |
| `game_data_version` | text | Pinned at activation; immutable (§8). |
| `random_seed` | text / bytea | Server-owned determinism seed (spec §12.6). |
| `state_version` | integer | Optimistic-concurrency counter (§6). |
| `active_player_id` | text (FK) | Mirror for indexing/locking. |
| `day_counter` | integer | Mirror. |
| `turn_deadline_at` | timestamptz | Mirror; drives scheduling (§9). |
| `state` | jsonb | Serialized authoritative engine state (§3). |
| `winner_player_id` | text (FK, null) | Set on completion. |
| `completion_reason` | text (enum, null) | `rules.yaml` `enums.completion_reasons`. |
| `created_at` / `activated_at` / `completed_at` | timestamptz | Lifecycle. |

Indexes: unique(`invitation_code`); (`status`); (`turn_deadline_at`) for the
deadline sweeper; (`active_player_id`).

## 5.3 `match_players`

Maps `domain-model.md` §7 (MatchPlayer). Holds **identity and setup**; mutable
per-turn gameplay values (funds, power meter, acted flags) live in `matches.state`
to keep a single authoritative source.

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `match_id` | text (FK) | |
| `user_id` | text (FK, null) | Null until invitation accepted. |
| `role` | text (enum) | host / guest. |
| `faction_id` | text | Blue/Green/Red/Yellow. |
| `commander_id` | text | Reference into `commanders.yaml`. |
| `is_ready` | boolean | Ready check (§3.5). |

Constraints: unique(`match_id`, `faction_id`) and unique(`match_id`,
`commander_id`) — no duplicate faction or commander per match (§3.4). Index
(`user_id`) for a user's match list.

## 5.4 `events` (authoritative, append-only)

Maps `domain-model.md` §12 (Event). The durable record of what happened.

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `match_id` | text (FK) | |
| `sequence` | integer | Per-match, starts at 1, contiguous (`replay_rules`). |
| `type` | text (enum) | `rules.yaml` `enums.event_types`. |
| `payload` | jsonb | Fully resolved values (`replay_rules.combat_event_fields`, spec §24.5). |
| `created_at` | timestamptz | |

Constraints: unique(`match_id`, `sequence`). **Append-only** — no UPDATE/DELETE in
application code; completed-match immutability enforced (`security_rules`). This
table is authoritative and **private** (never sent raw to clients).

## 5.5 `player_events` (per-player projections)

The client-safe projections produced by `create_player_event_projections`
(`backend.md` §4; `replay_rules.player_projections_safe_for_client`).

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `match_id` | text (FK) | |
| `player_id` | text (FK) | The viewer. |
| `sequence` | integer | Matches the authoritative sequence it derives from. |
| `type` | text (enum) | |
| `payload` | jsonb | Visibility-filtered payload. |
| `created_at` | timestamptz | |

Index (`match_id`, `player_id`, `sequence`). Reads for replay query this table,
never `events`.

> Projections are stored because the pipeline already computes them at write time.
> Computing them on read instead is a valid alternative, at the cost of repeating
> projection work per request.

## 5.6 `idempotency_keys`

Supports exactly-once mutations (`action_processing.idempotency`).

| Column | Type | Notes |
|---|---|---|
| `key` | text | Client-supplied idempotency key. |
| `match_id` | text (FK) | |
| `committed_result` | jsonb | The original response to replay on duplicate. |
| `created_at` | timestamptz | |

Constraint: unique(`match_id`, `key`). A duplicate key returns
`committed_result` rather than re-applying.

## 5.7 `notification_jobs`

Durable jobs for turn reminders and expiry (`backend.md` §9–§10; spec §26.3).

| Column | Type | Notes |
|---|---|---|
| `id` | text / uuid | PK. |
| `match_id` | text (FK) | |
| `player_id` | text (FK) | Recipient. |
| `type` | text (enum) | `turn_reminder`, `turn_expired`, … |
| `scheduled_at` | timestamptz | When to fire. |
| `sent_at` | timestamptz (null) | Set when delivered. |
| `status` | text (enum) | pending / sent / cancelled. |

Index (`status`, `scheduled_at`) for the scheduler. Notifications are never
gameplay-authoritative.

---

# 6. Optimistic concurrency and locking

Realizes `rules.yaml` → `concurrency_rules` and `game-specification.md` §25:

- The action transaction takes a **row lock** on the match:
  `SELECT ... FROM matches WHERE id = $1 FOR UPDATE`.
- It verifies `matches.state_version == action.expectedStateVersion`; on mismatch
  it aborts with a **typed conflict** carrying the current safe `state_version`
  and **no hidden state** (`conflict_response`).
- On success it increments `state_version` by exactly one and commits atomically
  with the state snapshot, events and projections (`backend.md` §4).

Two concurrent actions cannot both commit: the second observes a stale version
under the lock.

---

# 7. Append-only event store

Realizes `rules.yaml` → `replay_rules`:

- `events` is written, never rewritten. Sequence is per match, starts at 1 and is
  contiguous; `unique(match_id, sequence)` enforces order integrity.
- Authoritative events are private; only `player_events` reach clients.
- Completed matches are gameplay-immutable — only administrative metadata may
  change (`security_rules.completed_match_gameplay_immutable`).

---

# 8. Data-version pinning

Realizes `rules.yaml` → `data_versioning` and `game-specification.md` §31.2:

- `matches.game_data_version` is written at activation and **never changed** for an
  active match.
- Balance edits to the YAML never mutate active matches; replay uses the pinned
  version.
- The database stores only the version **string** — the actual `GameData` is
  loaded from YAML by `game-data` (§11).

---

# 9. Migrations

- Managed by **Drizzle Kit**; migrations are checked in and applied forward-only.
- Schema migrations must preserve the integrity of in-flight matches: they may add
  columns/tables but must not rewrite the semantics of an active match's `state`
  snapshot or its pinned `game_data_version`.
- A structural change that would alter active-match interpretation requires an
  explicit administrative migration (`data_versioning.migration_of_active_match`).

---

# 10. Transaction boundary

The entire action pipeline (`backend.md` §4, `action_processing.transaction_required`)
is one database transaction:

```text
BEGIN
  SELECT match FOR UPDATE            -- lock + read snapshot + state_version
  (engine: validate → apply → project → evaluate)   -- pure, no DB access
  INSERT events (append)             -- authoritative
  INSERT player_events (projections) -- per player
  UPDATE matches SET state, state_version = state_version + 1, mirrors...
  UPSERT idempotency_keys
COMMIT
```

No partial commit is allowed (`action_processing.failure.partial_commit_allowed:
false`).

---

# 11. What is not in the database

- **Reference data / `GameData`** — units, weapons, terrain, properties,
  commanders, damage matrix, maps and engine rules live in `02-data/*.yaml` and
  are loaded/validated by `game-data`. The database stores only the pinned
  version string.
- **Derived values** — e.g. `displayHp` — are computed from stored `trueHp`, never
  persisted as an independent source (`domain-model.md` §3).

---

# 12. Cross-references

- `domain-model.md` — entity definitions this schema stores.
- `backend.md` — §4 pipeline, §8 concurrency, §9 deadlines, §10 notifications.
- `architecture.md` — §5 engine role, §7 lifecycle.
- `rules.yaml` — `action_processing`, `concurrency_rules`, `replay_rules`,
  `data_versioning`, `security_rules`, `enums`.
- `game-specification.md` — §25 (concurrency), §29 (security/immutability), §31
  (structured data and versioning).
