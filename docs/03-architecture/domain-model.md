# Iron Grid — Domain Model

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Engine, backend, database, QA, AI contributors

> This document is the **canonical, technology-agnostic** description of the Iron
> Grid domain: the entities, their fields, identities, relationships, lifecycles
> and invariants. Both the pure-engine state shape and the database schema derive
> from this model.
>
> It describes **structure**, not behavior. What *happens* to these entities
> (combat, capture, movement, victory) is defined in `game-specification.md`.
> Numeric game values (costs, ranges, damage) live in the `02-data` YAML files.
>
> **Precedence:** this document is subordinate to `game-specification.md`
> (see `master-index.md`). Where the specification fixes a field or value, the
> specification is authoritative and this model must stay consistent with it.

---

# 1. Purpose and scope

Today the entity shapes are scattered: match states in `game-specification.md`
§3.1, the unit instance in §9.1, event types in §24.2, and the enums in
`rules.yaml`. This document consolidates them into one structural reference so
that:

- The engine's `state`, `action`, `events` and `PlayerView` types have a single
  definition source.
- The database schema (`database.md`) maps from a stable, named model.
- Contributors reason about the same entities with the same names.

It covers: identity conventions, the entity map, and each entity's fields,
lifecycle and invariants.

It does **not** cover: persistence mapping (→ `database.md`), API surface
(→ `backend.md`), rendering (→ `frontend.md`), or gameplay rules
(→ `game-specification.md`).

---

# 2. Reference data vs runtime state

Two categories of data exist. Keeping them separate is fundamental to the
data-driven, deterministic design.

| Category | What | Source | Mutability |
|---|---|---|---|
| **Reference data** (`GameData`) | Unit/weapon/terrain/property/commander definitions, damage matrix, map layouts, engine rules. | `02-data` YAML → `game-data` package. | Immutable. Versioned. Pinned per match. |
| **Runtime state** | Everything that changes during a match: the match, its players, the board, units, properties, actions, events. | Created and mutated by the engine/backend. | Mutable (except append-only events). |

The domain **entities** below are runtime state. They *reference* reference data
by stable id (e.g. a unit's `typeId` points into `units.yaml`); they never copy
its values.

---

# 3. Identity and conventions

- **Identifiers** are stable, opaque strings unique within their scope. Entity
  references use ids, never array positions.
- **Funds** and **HP** are integer-based (`game-specification.md` §6.1, §9.2).
- **Derived fields** are never stored as an independent source of truth. In
  particular `displayHp = ceil(trueHp / 10)` (§9.2) is derived from `trueHp`.
- **Coordinates** are logical grid cells `(x, y)`, origin top-left, independent of
  render scale (§7.1).
- **Enumerated values** (match status, action type, event type, completion
  reason) are canonical in `rules.yaml` → `enums`. This document names them but
  does not redefine the list.

---

# 4. Entity map

```text
User (account)
  │ 1
  │        participates in
  │ N
MatchPlayer ──────────────┐
  │ N                     │ belongs to
  │ owns                  │
  ▼ N                     ▼ 1
Unit ─────────► occupies  Match  (aggregate root)
  │ cargo N               │  1
  ▼                       ├── settings, status, versioning, seed, outcome
Unit (loaded)            │
                          │ contains
PropertyInstance ◄────────┤
  (owner: MatchPlayer?)   │
                          │ produces (append-only)
Action ──────────────────►┤
  (submitted by player)   ▼
                          Event  (sequence-numbered, per-player projected)

BoardCell (static terrain, from Map reference data) underlies all positions.
```

Relationships in words:

- A **User** may participate in many matches; within one match a user is a
  **MatchPlayer**.
- A **Match** has exactly two MatchPlayers in the MVP.
- A **Match** owns a set of **Units** and **PropertyInstances** positioned on the
  **Board**.
- A **Unit** may carry other Units as **cargo**.
- An **Action** submitted by a player produces one or more **Events**.

---

# 5. User

The authenticated account, independent of any match. Established by magic-link
auth (`game-specification.md` §1.3; auth detail in `backend.md`).

| Field | Meaning |
|---|---|
| `id` | Stable user id. |
| `email` | Login identity (magic link). |
| `notificationPreferences` | Per-type toggles (§26.2): invitation, turn started, turn reminder, turn expired, match completed. |
| `createdAt` | Account creation timestamp. |

A User is not a game entity; it is the identity that a MatchPlayer points to.

---

# 6. Match (aggregate root)

The top-level container for one game. It owns lifecycle, settings, players and the
board state.

| Field | Meaning |
|---|---|
| `id` | Stable match id. |
| `status` | One of the match statuses (§3.1 / `rules.yaml`): `draft`, `waiting_for_opponent`, `commander_selection`, `ready_check`, `active`, `completed`, `cancelled`. |
| `mapId` | The official map this match is played on (`maps.yaml`). |
| `settings` | Host-chosen options: fog on/off, turn deadline (24h / 3d / 7d / none), optional day limit, supported victory conditions (§3.2). |
| `invitationCode` | Six-character alphanumeric code, no ambiguous characters (§3.3). |
| `gameDataVersion` | The `GameData` version pinned at activation (§31.2). Immutable for the life of the match. |
| `randomSeed` | Server-owned seed for deterministic randomness (§12.6). |
| `stateVersion` | Monotonic integer incremented on every applied action (§25). |
| `dayCounter` | Current day (§4.2). Advanced by `resolveStartOfTurn` when the turn reaches the **first** player (`turn_sequence.start_of_turn.advance_turn_and_day_counters`). **Activation convention:** the backend initializes it to `0`, so the first player's opening start-of-turn lands the match on Day 1 (and grants that day's income) — initializing it to `1` would double-count the day or skip the opening income. |
| `activePlayerId` | The MatchPlayer whose turn it is while `active`. |
| `turnDeadlineAt` | When the current turn expires, if a deadline is set (§4.3). |
| `outcome` | Set on completion: winner (or draw) and completion reason (§23, `rules.yaml` `completion_reasons`). |
| `createdAt` / `activatedAt` / `completedAt` | Lifecycle timestamps. |

## 6.1 Match lifecycle (state machine)

```text
draft ─► waiting_for_opponent ─► commander_selection ─► ready_check ─► active ─► completed
   │                                                                     │
   └──────────────────────────► cancelled ◄──────────────────────────────┘
```

Transitions are defined behaviorally in `game-specification.md` §3. Only the
server performs transitions. `cancelled` is reachable before `active`; `completed`
is terminal (§3.1).

---

# 7. MatchPlayer

One participant within one match. Distinct from the User account.

| Field | Meaning |
|---|---|
| `id` | Stable per-match player id. |
| `matchId` | Owning match. |
| `userId` | The User behind this player (null while an invitation is unaccepted). |
| `role` | Host or guest. |
| `factionId` | Blue / Green / Red / Yellow — determined by commander choice (§22.1). |
| `commanderId` | Chosen commander (`commanders.yaml`). Design-blocked content, structure only. |
| `isReady` | Ready-check confirmation (§3.5). |
| `funds` | Integer funds, never negative (§6.5). |
| `powerMeter` | Commander power charge (§22.5). Charge formula is a design blocker. |
| `hasClaimVictoryRight` | Whether this player may currently claim victory after opponent timeout (§4.4). |

Constraints: within a match, `factionId` and `commanderId` are unique across
players (no duplicate commander or faction color) (§3.4).

---

# 8. Board and BoardCell

The board is the fixed logical grid of the match's map (20×16, §7.1). Cells are
**reference data** derived from `maps.yaml`; they are largely static during play.

| Field | Meaning |
|---|---|
| `x`, `y` | Logical coordinate. |
| `logicalTerrain` | Terrain type id (`terrain.yaml`), e.g. `plain`, `forest`, `mountain`. |
| `renderTileId` | Visual tile reference, separate from logical terrain (§7.4). |

Destructible terrain state (e.g. Pipe Seam HP, §21) and property ownership are
runtime overlays, modeled by `PropertyInstance` and terrain-object state, not by
mutating the base cell definition.

---

# 9. Unit

A unit instance on the board. Consolidates `game-specification.md` §9.1; this is
the structural source for the engine's unit type.

| Field | Meaning |
|---|---|
| `id` | Stable unit instance id. |
| `typeId` | Unit definition id (`units.yaml`), e.g. `infantry`, `tank`. |
| `ownerPlayerId` | Owning MatchPlayer. |
| `x`, `y` | Position (undefined while loaded as cargo). |
| `trueHp` | Internal health, 1–100 (§9.2). |
| `displayHp` | Derived: `ceil(trueHp / 10)`. Not an independent field. |
| `fuel` | Remaining fuel (§17). |
| `ammo` | Remaining primary-weapon ammo (§17.4). |
| `hasActed` | Whether the unit has ended its activation this owner turn (§10.5). |
| `isCapturing` | Whether a capture is in progress (§13). |
| `captureTargetId` | The PropertyInstance being captured, if any. |
| `cargo` | Loaded units carried by this unit (§16). |
| `visibilityState` | Server-side visibility bookkeeping used for projection. |
| `specialState` | Unit-specific state, e.g. submarine `surfaced` / `submerged` (§19). |
| `createdTurn` | The turn the unit was produced; a produced unit cannot act that turn (§6.4). |

Cargo units are **not** board-occupying: they have no `x`/`y` while loaded and are
destroyed with their transport (§16.1, §16.4).

---

# 10. PropertyInstance

A capturable/functional property placed on the board (`properties.yaml` defines
its type behavior; `maps.yaml` places it).

| Field | Meaning |
|---|---|
| `id` | Stable property instance id. |
| `propertyType` | City, Base, Airport, Port, HQ, Missile Silo, etc. (`properties.yaml`). |
| `x`, `y` | Position. |
| `ownerPlayerId` | Owning MatchPlayer, or null when neutral. |
| `capturePoints` | Remaining capture resistance, 0–20; starts at 20 (§13.3). |
| `objectState` | For stateful properties, e.g. Missile Silo intact vs used (§20). |

Income, repair, resupply and production capabilities are properties of the
`propertyType` in `properties.yaml`, not per-instance fields.

---

# 11. Action

A command submitted by a player. The engine validates it and, if legal, applies
it. Action types are canonical in `rules.yaml` → `enums.action_types` (§11).

| Field | Meaning |
|---|---|
| `type` | One of the action types: `move_and_wait`, `attack`, `capture`, `supply`, `load`, `unload`, `join`, `produce`, `dive`, `surface`, `launch_missile`, `activate_power`, `end_turn`, `resign`, `claim_victory`. |
| `matchId` | Target match. |
| `payload` | Type-specific data (unit id, ordered path, target coordinate, produced unit type, etc., per §10.1 and each action's section). |
| `expectedStateVersion` | Optimistic-concurrency guard; must match the match's current `stateVersion` (§25). |
| `idempotencyKey` | Required for mutation retries (§29). |

The client never decides that an action is legal; legality is computed server-side
from state (§11).

---

# 12. Event

The append-only, sequence-numbered record of what happened. Events are the replay
substrate and the audit log. Event types are canonical in `rules.yaml` →
`enums.event_types` (§24.2).

| Field | Meaning |
|---|---|
| `id` | Stable event id. |
| `matchId` | Owning match. |
| `sequence` | Monotonic order within the match. |
| `type` | One of the event types (e.g. `unit_moved`, `unit_attacked`, `property_captured`, `turn_started`, `match_completed`). |
| `payload` | Fully resolved data sufficient to replay without recomputation: final path, luck rolls, damage, HP before/after, actor/target references, resulting state changes (§24.5). |
| `createdAt` | Emission timestamp. |

Properties of events:

- **Append-only.** Events are never mutated or deleted (§29).
- **Deterministic.** Persisted luck/results mean replay never rerolls (§12.6).
- **Per-player projection.** Each player receives only the events they could
  observe when they occurred; projection happens server-side before delivery
  (§24.4). See `architecture.md` §9.

---

# 13. PlayerView (derived read-model)

`PlayerView` is **not** a stored entity — it is the per-player, visibility-filtered
projection of the runtime state that the engine produces and the server ships to a
client. It is the output of `projectStateForPlayer(state, playerId, gameData)`
(`rules.yaml` → `engine_contract`; `architecture.md` §5). It is listed here so the
engine and frontend have a single named definition to point to.

It is derived from the entities above, never authored independently, and it carries
**only what the viewer may know** (`game-specification.md` §18.1, §29). A `PlayerView`
therefore contains:

| Content | Meaning |
|---|---|
| `matchId`, `status`, `dayCounter`, `stateVersion` | Public match context; `stateVersion` is echoed back on the next action's `expectedStateVersion` (§15). |
| `activePlayerId`, `turnDeadlineAt` | Whose turn it is and when it expires. |
| `viewerPlayerId` | The MatchPlayer this view was projected for. |
| Visible board, units and properties | Only entities the viewer can currently observe; hidden units, submerged submarines and cargo identity are omitted or redacted (§18, §16.5, §19.4). |
| Own private state | The viewer's own `funds`, `powerMeter` and full unit detail. |
| Opponent public state | Only what fog and hidden-information rules permit. |

Properties:

- **Server-produced, before delivery.** Projection runs server-side; the raw
  authoritative `state` never leaves the server (`architecture.md` §9,
  `backend.md` §6).
- **Non-authoritative on the client.** The client renders it and may compute
  previews from it, but the server re-checks every action (`game-specification.md`
  §27.3; `frontend.md` §1, §6).
- **Distinct from the event stream.** `PlayerView` is the current *result*;
  per-player `Event` projections (§12) are the *history*. Both are visibility-filtered.

---

# 14. Invariants

Structural integrity rules the engine and persistence must uphold. Behavioral
detail is in the referenced sections.

- `funds >= 0` at all times; deductions are atomic (§6.5).
- `1 <= trueHp <= 100`; `displayHp` always equals `ceil(trueHp / 10)` (§9.2).
- `0 <= capturePoints <= 20` (§13.3).
- Exactly one `activePlayerId` while `status == active`.
- A produced unit has `hasActed == true` on its `createdTurn` (§6.4).
- Loaded cargo has no board position and is destroyed with its transport (§16).
- Within a match, `factionId` and `commanderId` are unique per player (§3.4).
- `stateVersion` is strictly monotonic; a stale `expectedStateVersion` rejects the
  action (§25).
- `gameDataVersion` is fixed at activation and never changes for an active match
  (§31.2).
- Events are append-only and strictly ordered by `sequence`.

---

# 15. State versioning and concurrency

- Every applied action increments `Match.stateVersion` by one.
- Every action carries `expectedStateVersion`; the server rejects the action with
  a typed conflict if it does not match the current version (§25.3).
- Two concurrent actions cannot both commit; the second sees a stale version.
- The engine is pure: it computes `nextState` and `events` from
  `(state, action, gameData, randomSource)` and does not itself persist or read
  the clock. Persistence and version increment are the backend's responsibility
  (`architecture.md` §7, `backend.md`).

---

# 16. Cross-references

- `game-specification.md` — behavioral source of truth; §3 (lifecycle), §9 (unit),
  §24 (events/replay), §25 (concurrency), §31 (data versioning).
- `rules.yaml` → `enums` — canonical status/action/event/completion enumerations;
  `engine_contract` — the functions that consume and produce these entities.
- `architecture.md` — how these entities flow through the layers.
- `database.md` — how this model maps to PostgreSQL + Drizzle.
- `02-data/*.yaml` — reference-data definitions the entities point to by id.
