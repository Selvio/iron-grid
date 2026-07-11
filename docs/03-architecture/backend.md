# Iron Grid — Backend

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Backend, engine, database, QA, AI contributors

> This document describes the server: the API surface, how it drives the pure
> engine inside a transaction, authentication, replay delivery, turn deadlines,
> notifications and security.
>
> It **references** rather than restates the canonical engine-level rules, which
> live in `rules.yaml` (e.g. `action_processing`, `concurrency_rules`,
> `timeout_claim_rules`, `replay_rules`, `notifications`, `security_rules`,
> `data_versioning`) and in `game-specification.md` §4, §5, §24–§26, §29. Where a
> rule is enumerated there, this document points to it instead of copying it.
>
> Entities named here (Match, Action, Event, …) are defined in `domain-model.md`.
> The end-to-end request flow is drawn in `architecture.md` §7.

---

# 1. Responsibilities and boundaries

The backend is the **orchestrator**. It never decides game rules and never
mutates state by itself.

| Concern | Owner |
|---|---|
| Decide whether an action is legal and what it produces | `game-engine` (pure) |
| Persist state, events and version; enforce transactions | Backend + database |
| Authenticate, authorize match membership | Backend |
| Seed deterministic randomness, pin game-data version | Backend |
| Project player-specific views before responding | `game-engine`, invoked by backend |
| Schedule/send notifications | Backend (non-authoritative) |

The engine is called *between* the database read and write, inside one
transaction. The backend supplies the engine with the pinned `GameData` and a
deterministic `randomSource`; the engine returns `nextState` and `events`; the
backend persists them and increments the version.

---

# 2. Runtime and framework

- **Next.js App Router route handlers** (`app/api/**/route.ts`) implement the
  server endpoints.
- Mutation endpoints run on the **Node.js runtime** (not Edge): they need
  transactional database access and row locks.
- All server code may import the full stack (Drizzle, Auth.js, Resend, the
  engine and data packages). It may **never** be imported by `game-engine` or
  `game-data` (`architecture.md` §4).

---

# 3. API surface

Illustrative surface; exact routing is an implementation detail, but the
capabilities are fixed by the domain and lifecycle.

| Area | Endpoint | Purpose |
|---|---|---|
| Auth | `/api/auth/*` | Auth.js magic-link handlers (see §7). |
| Match lifecycle | `POST /api/matches` | Create a match in `draft`; generate invitation code (§3.3). |
| | `POST /api/matches/:id/join` | Guest accepts via code → `commander_selection`. |
| | `POST /api/matches/:id/commander` | Select commander/faction (§3.4). |
| | `POST /api/matches/:id/ready` | Confirm ready check (§3.5); activates when both ready. |
| | `POST /api/matches/:id/cancel` | Cancel before activation. |
| Gameplay | `POST /api/matches/:id/actions` | Submit one `Action` envelope (any action type, incl. `resign`, `claim_victory`). See §4. |
| Reads | `GET /api/matches/:id` | Player-filtered current state (§6). |
| | `GET /api/matches/:id/events?since=` | Player-projected events for replay (§6). |
| Account | `GET/PATCH /api/me/notifications` | Read/update notification preferences (§8). |

A **single actions endpoint** carries every gameplay command, discriminated by
`Action.type`. This keeps the authoritative pipeline (§4) uniform. `claim_victory`
and `resign` are action types but follow their own transactional rules (§5, §9).

---

# 4. Action processing pipeline

Every mutation runs the ordered, transactional pipeline that is **canonical in
`rules.yaml` → `action_processing.ordered_steps`** (mirrored by
`game-specification.md` §24.1). The backend executes it as a single atomic
transaction:

```text
authenticate_player
authorize_match_membership
verify_match_status
verify_expected_state_version          ── mismatch ─► typed conflict (§8)
validate_action_payload_schema
validate_action_legality               ── engine: validateAction()
resolve_deterministic_randomness       ── seeded randomSource (§5)
apply_state_changes                    ── engine: applyAction()
create_authoritative_events
evaluate_visibility_changes
create_player_event_projections        ── engine: projectStateForPlayer()
evaluate_victory                       ── engine: evaluateVictory()
increment_state_version
persist_atomically
```

Failure semantics (canonical in `rules.yaml` → `action_processing.failure`):
partial commit is not allowed; a failed action consumes no random sequence, ammo
or funds, and does **not** change `stateVersion`.

**Idempotency** (`action_processing.idempotency`): every mutation carries an
`idempotencyKey`; a duplicate key returns the original committed result rather
than re-applying.

---

# 5. Engine integration and determinism

The backend is the only place randomness and the clock enter the system; the
engine stays pure (`architecture.md` §5, §8).

- **Game data:** the backend loads the `GameData` version pinned on the match
  (§10) and passes it to every engine call.
- **Randomness:** the backend constructs a deterministic `randomSource` from the
  match's `randomSeed` plus the action's sequence index
  (`rules.yaml` → `randomness.seed`). The engine consumes it; it never reads a
  global RNG or wall clock.
- **Resolved values persisted:** combat events store the fields listed in
  `rules.yaml` → `replay_rules.combat_event_fields` (selected weapon, luck,
  damage, HP before/after, …) so replay never recomputes or rerolls.

The engine functions invoked are exactly those in
`rules.yaml` → `engine_contract.required_public_functions`; the backend does not
add authoritative logic of its own.

---

# 6. Reads, projection and replay

- **Every read is membership-checked and player-projected.** Only the host and the
  accepted guest may read gameplay state (`security_rules.validate_membership_on_every_read`).
  The response is produced by `projectStateForPlayer` — the server never ships
  hidden state (`architecture.md` §9).
- **Replay** follows `rules.yaml` → `replay_rules`: the authoritative event store
  is append-only, sequence-scoped per match and contiguous from 1. Clients receive
  **per-player projections**, never the authoritative stream.
- **Opponent-turn playback** is automatic and skippable, with a textual summary
  (`replay_rules.opponent_turn_playback`; §24.3). Full completed-match replay UI is
  out of MVP scope but the data is preserved.

---

# 7. Authentication and authorization

- **Authentication:** Auth.js with magic-link email delivered via Resend
  (`game-specification.md` §1.3). Sessions identify the `User` (`domain-model.md`
  §5).
- **Authorization:** match membership is validated on **every** read and write
  (`security_rules.validate_membership_on_every_read` / `_on_every_write`). A
  session that is neither host nor accepted guest cannot access gameplay state.
- The active-player check is part of the action pipeline (§4): only the active
  player may submit gameplay actions during their turn (`claim_victory` is the
  deliberate exception — it is available to the inactive opponent, §9).

---

# 8. Concurrency

Canonical in `rules.yaml` → `concurrency_rules` (mirrored by
`game-specification.md` §25):

- Every action carries `expectedStateVersion`; the transaction takes a **match row
  lock** and rejects stale actions.
- A successful commit increments `stateVersion` by exactly one; exactly-once
  semantics come from the idempotency key.
- Multiple tabs/devices are allowed. A stale client receives a **typed conflict**
  response that includes the current safe `stateVersion` and **no hidden state**,
  and must refresh/reconcile.

---

# 9. Turn deadlines and Claim Victory

- **Deadline:** set when `turn_started` commits (`rules.yaml` → `time_model` /
  `turn_sequence`; §4.3). Supported options: 24h, 3d, 7d, none.
- **Expiration does not auto-end the turn.** On expiry the inactive opponent gains
  the right to claim victory; the late player may still submit a valid action, and
  the first such action revokes the claim right (§4.4).
- **Claim Victory** is server-authoritative and atomic, following
  `rules.yaml` → `timeout_claim_rules`: the deadline must be expired, the claimant
  must be the inactive opponent, the match must be active, and the transaction
  locks the match row, compares the state version and completes the match
  atomically. Failure codes: `deadline_not_expired`, `victory_claim_unavailable`,
  `stale_state_version`, `match_already_completed`. On success the winner is the
  claimant with reason `timeout_claimed`.
- **Scheduling:** deadline expiry and the turn reminder (§10) are driven by durable
  jobs or recomputable timestamps (§26.3); they are operational, never
  gameplay-authoritative.

---

# 10. Notifications

Canonical in `rules.yaml` → `notifications` (mirrored by `game-specification.md`
§26):

- **Provider:** Resend. **Not** gameplay-authoritative — a missed email never
  changes match state.
- **Triggers:** `match_invitation`, `turn_started`, `turn_reminder`,
  `turn_expired`, `match_completed`.
- **Default preferences** (per user, overridable): invitation, turn started, turn
  reminder and match completed on by default; turn expired off by default.
- **Reminder timing:** when ~20% of the allotted turn time remains
  (`notifications.reminder.remaining_time_percent`). Matches with no deadline get
  no reminder.
- Scheduling uses durable jobs or recomputable timestamps so reminders survive
  restarts.

---

# 11. Data-version pinning

Canonical in `rules.yaml` → `data_versioning` (mirrored by `game-specification.md`
§31.2):

- On activation, the match stores the `GameData` version it starts with.
- Balance changes must not alter active matches; migration of an active match is
  forbidden unless an explicit administrative migration exists.
- Replay uses the original pinned version. The backend loads the pinned version
  for every action and every replay of that match.

---

# 12. Security and anti-cheat

Canonical in `rules.yaml` → `security_rules` (mirrored by `game-specification.md`
§29). The backend enforces:

- Membership validated on every read and write.
- Client-supplied gameplay values are **ignored** — damage, selected weapon, luck,
  cost, ownership, movement cost, visibility, capture power, repair amount and
  production list all come from the server/engine, never the client.
- Invitation and action **rate limits**.
- Hidden state redacted from logs.
- Completed matches are gameplay-immutable (only administrative metadata may
  change); events are append-only.

---

# 13. Cross-references

- `architecture.md` — §7 action lifecycle, §5 engine role, §8 determinism, §9
  information security.
- `domain-model.md` — Match, MatchPlayer, Action, Event entity definitions.
- `database.md` — how the transaction, row lock, append-only events and version
  columns are realized in PostgreSQL + Drizzle.
- `rules.yaml` — `action_processing`, `concurrency_rules`, `timeout_claim_rules`,
  `replay_rules`, `notifications`, `security_rules`, `data_versioning`,
  `time_model`, `turn_sequence`, `randomness`, `engine_contract`.
- `game-specification.md` — §4 (time), §5 (start-of-turn), §24 (replay), §25
  (concurrency), §26 (notifications), §29 (security).
