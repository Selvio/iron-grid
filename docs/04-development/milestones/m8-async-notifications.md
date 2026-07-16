# Iron Grid — M8 · Async model & notifications (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Backend / engine / QA contributors

> This is the **execution-detail** breakdown of milestone **M8** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place is
> `roadmap.md` §5; the async contract is `backend.md` §9 (turn deadlines / Claim
> Victory) and `rules.yaml` → `timeout_claim_rules` / `time_model.expiration`; the
> notification contract is `backend.md` §10 and `rules.yaml` → `notifications`
> (with `game-specification.md` §4, §26). It composes the **M7 action pipeline**
> (which stamps `turnDeadlineAt` per turn), M5's Resend/auth layer, M6's lifecycle,
> and M4's `notification_jobs` table + concurrency/event/idempotency primitives. The
> exit gate is `game-specification.md` §4, §26, §34, §35 (#25) and
> `coding-standards.md` §11–§12.

---

# 1. Purpose

M8 continues **Phase 2 — Server**. It closes the **asynchronous match model** and
adds **email notifications**. On the M7 pipeline that already stamps a turn
deadline, it delivers: **Claim Victory** — the inactive opponent completes an
abandoned match once the turn deadline has passed (`timeout_claimed`) — with the
turn-expiry semantics the spec requires (expiry never auto-ends a turn; the late
player may still act, and their first valid action revokes the claim); and the
five **gameplay notification triggers** (`match_invitation`, `turn_started`,
`turn_reminder`, `turn_expired`, `match_completed`) scheduled as durable
`notification_jobs` and delivered by Resend — **never gameplay-authoritative** (a
missed email never changes match state).

M8 introduces the **execution model** the docs leave open (`backend.md` §9/§10:
"durable jobs or recomputable timestamps"): **claim eligibility is lazy /
recomputable** (the backend compares the wall clock to `turnDeadlineAt` at claim
time — no scheduler is needed for gameplay correctness), while **email delivery is
a cron-drained job queue** — a secured drain endpoint invoked by a scheduled
trigger sends due `notification_jobs` through an injected mailer. The engine stays
pure (it never reads the clock); all time comparisons live in the backend.

M8 stops before **M9** (the branded UI) and **M10** (the client engine / previews).
It ships the server-side async + notification surface those layers consume.

**Current state** (starting point): the finished, verified M7 workspace — the
transactional action pipeline (`app/server/actions`), `handleSubmitAction`,
`createRandomSource`, the M6 lifecycle, M5 auth (`requireUser`,
`requireMatchMembership`, the Resend `MagicLinkMailer` seam), and M4 persistence.
`MatchMeta.turnDeadlineAt` is stamped on every `turn_started`;
`MatchMeta.expiredTurnClaimAvailableTo` **exists but is only ever cleared** —
nothing grants the claim right, nothing compares `now` to the deadline, and
`claim_victory` is rejected by the envelope as `UnsupportedActionError`. The
`notification_jobs` table exists (M4-T6) with **no query/enqueue helper**, **no
dedupe key**, and nothing enqueues or delivers. `users.notification_preferences`
and `GET/PATCH /api/me/notifications` (M5-T5) are live. There is **no cron / worker
/ scheduler** anywhere.

---

# 2. Gates for M8

- **Entry (DoR):** each ticket is specified with goal/scope/files/acceptance; the
  primitives it composes are landed (M4/M5/M6/M7); the `timeout_claim_rules` and
  `notifications` contracts are canonical. **No open §33 blocker gates M8** —
  unlike M6/M7. Claim Victory is `timeout_claim` (`victory_rules.conditions.timeout_claim`,
  `immediate: true`), independent of §33.1 commander data and §33.2 day-limit
  scoring; the notification triggers depend on neither. (`day_limit` victory
  scoring stays gated by §33.2 and is out of scope regardless.)
- **Exit (DoD):** the **async / notification slice** of the Functional Definition
  of Done (`game-specification.md` §4, §26, §34): a turn deadline that passes does
  not auto-end the turn; the inactive opponent can Claim Victory atomically once it
  has, and a late valid action revokes that right; the five triggers enqueue
  preference-gated `notification_jobs` and the cron drain delivers them via an
  injected mailer without ever blocking gameplay — plus the code-change bar
  (`coding-standards.md` §11–§12). Runs on the M6 fixtures with a **faked mailer**;
  the live Vercel Cron trigger is deploy config (its handler is tested directly).
  The milestone DoD is §5.

---

# 3. Cross-cutting decisions

- **Claim eligibility is lazy / recomputable; only emails need a scheduler**
  (`backend.md` §9, §10). Gameplay correctness never depends on a background actor:
  the claim transaction compares `now` (backend clock) to the persisted
  `turnDeadlineAt` at claim time. The engine remains pure — it never reads the
  clock (`engine_contract.purity`); every time comparison is in the backend. Only
  `turn_reminder` / `turn_expired` **mail** needs time-driven execution, handled by
  the cron drain (below).
- **The late-action-revokes-claim rule uses a backend-stamped `lastActionAt`
  marker** (`time_model.expiration.first_valid_late_action_revokes_claim`). Version
  compare alone cannot distinguish "the late player acted after expiry" from "the
  opponent read fresh state" (a mid-turn action bumps the version but does not
  re-stamp the deadline). Decision: add `MatchMeta.lastActionAt: Timestamp | null`
  (backend-stamped on every committed action, **cleared to `null` by
  `resolveStartOfTurn`** at each turn start — a null write needs no clock, so the
  engine stays pure). Claim is eligible iff the deadline is set and passed **and**
  no action was committed after it: `now > turnDeadlineAt ∧ (lastActionAt = null ∨
  lastActionAt ≤ turnDeadlineAt)`. This is exact, lazy, and needs no sweeper.
- **Claim Victory is a bespoke sibling of the pipeline, not `handleSubmitAction`**
  (`backend.md` §3: `claim_victory`/`resign` "follow their own transactional
  rules"; §7 the inactive-opponent exception). It **reuses the pipeline's
  transaction scaffolding** (lock → version compare → apply → persist → events +
  projections → idempotency → committed-result envelope) but **inverts the authz
  head**: the claimant must be the **inactive** player, and the gate is
  deadline-expired + claim-available, not `validateAction` turn legality. It is
  dispatched from `POST /api/matches/:id/actions` by `Action.type` — a separate
  `handleClaimVictory`, so the active-player pipeline is untouched.
- **The engine gets a `claim_victory` variant** (mirroring M7-T5's `resign`):
  `ClaimVictoryAction` + `applyClaimVictory` complete the match (winner = claimant,
  `completionReason "timeout_claimed"`, events `victory_claimed` + `match_completed`),
  and a typed `VictoryClaimedEvent`. The engine asserts only the **clock-free**
  preconditions (claimant is the inactive player, match active); the
  **deadline-expired** and **no-late-action** gates stay in the backend (purity).
- **Notifications never block gameplay** (`notifications.gameplay_authority: false`).
  Enqueue is an **additive post-commit step** outside the action's atomic guarantee
  — the `action_processing.ordered_steps` contain **no** notification step
  (`m7-actions.md` §6). A failure to enqueue or send is swallowed/logged, never
  rolled back into the gameplay transaction, and never surfaced as a gameplay error.
- **All five triggers persist as `notification_jobs`; the cron endpoint drains
  them** (`database.md` §5.7, the `(status, scheduled_at)` index). Immediate
  triggers (`match_invitation`, `turn_started`, `match_completed`) are enqueued
  with `scheduledAt = now`; time-based ones (`turn_reminder` at
  `reminder.remaining_time_percent: 20`, `turn_expired` at the deadline) with a
  future `scheduledAt`; `turnDeadline = "none"` schedules neither
  (`reminder.no_deadline_match_has_reminder: false`). A secured
  `POST /api/cron/notifications` claims due `pending` jobs, checks the recipient's
  `users.notification_preferences`, sends via the injected mailer, and marks
  `sent`; on turn hand-off the pipeline **cancels** the prior turn's outstanding
  `turn_reminder` / `turn_expired` jobs (`pending → cancelled`).
- **Jobs are deduped by a unique key** (additive migration). A per-turn
  reminder/expired job must not be enqueued twice. Decision: add a `dedupeKey` text
  column + `unique(match_id, player_id, type, dedupe_key)` and enqueue with
  `onConflictDoNothing`; the key encodes the turn (e.g. the `turnDeadlineAt` instant
  or the turn's opening `stateVersion`). Forward-only (`database.md` §9).
- **Delivery reuses the M5 Resend seam** (`auth/providers/magic-link.ts`): a
  `NotificationMailer` interface + a default `resendMailer`-style impl reading
  `RESEND_API_KEY` / `EMAIL_FROM` **at send time** (`auth/env.ts`), injected so
  tests pass a fake and send no real email. These are **gameplay** notifications —
  distinct from the transactional magic-link auth mail (M5 §3).
- **The cron trigger is deploy config, not app logic** (Vercel Cron via
  `vercel.json` + a shared-secret guard on the drain route). The drain **handler**
  is fully tested with a faked mailer against PGlite; the scheduled invocation is
  verified in the deploy environment (analogous to the M7 CI-Postgres gate).

---

# 4. Tickets

## M8-T1 · `claim_victory` engine variant
- **Goal:** the pure engine resolution of a timeout claim (`victory_rules.conditions.timeout_claim`;
  spec §23.1), the clock-free half of Claim Victory.
- **Scope:**
  - Add `ClaimVictoryAction` to the `Action` union (`actions.ts`, remove `claim_victory`
    from `FutureAction`'s `Exclude`) and a typed `VictoryClaimedEvent` to the `Event`
    union (`events.ts`, `Exclude` `victory_claimed` from `FutureEvent`).
  - `applyClaimVictory(state, action)` — mark the match `completed`, `winnerPlayerId =
    claimant`, `completionReason "timeout_claimed"`, emit `victory_claimed` +
    `match_completed` (pattern of `resign.ts applyResign`).
  - `validateAction` branch asserting only the **clock-free** preconditions: match
    active and the claimant is the **inactive** player (the deadline gate lives in the
    backend). Wire into `apply.ts` dispatch and `validate.ts`.
- **Files:** `packages/game-engine/src/claim-victory.ts` (+ `actions.ts`, `events.ts`,
  `apply.ts`, `validate.ts`, `index.ts`), engine tests.
- **Acceptance:** `applyClaimVictory` completes the match to the claimant with reason
  `timeout_claimed` and the two events; `validateAction` accepts the inactive player
  on an active match and rejects the active player / a completed match; `tsc`/`lint`/
  tests green.
- **Dependencies:** M3 victory, M7-T5 (`resign` as the pattern).

## M8-T2 · Deadline-expiry model & the `lastActionAt` claim marker
- **Goal:** the exact, lazy representation of turn expiry and claim revocation
  (`time_model.expiration`; §3 decision).
- **Scope:**
  - Add `MatchMeta.lastActionAt: Timestamp | null` (optional, defaulting absent so
    fixtures need no change); `createInitialMatchState` sets it `null`;
    `resolveStartOfTurn` clears it to `null` at turn start (no clock).
  - The M7 pipeline stamps `lastActionAt = now` on every committed action (via the
    snapshot meta); `end_turn` already clears `expiredTurnClaimAvailableTo`.
  - A backend helper `isClaimEligible(state, now)` (and `deadlineExpired`) encoding
    `now > turnDeadlineAt ∧ turnDeadlineAt ≠ null ∧ (lastActionAt = null ∨ lastActionAt
    ≤ turnDeadlineAt)`.
- **Files:** `packages/game-engine/src/state.ts` + `setup.ts` + `start-of-turn.ts`,
  `app/server/actions/submit.ts`, a claim-eligibility helper (`app/server/actions/claim-eligibility.ts`),
  tests.
- **Acceptance:** a fresh turn has `lastActionAt = null`; a committed action stamps it;
  `resolveStartOfTurn` clears it; `isClaimEligible` is true only when the deadline is
  set, passed, and no action followed it; a `"none"`-deadline match is never eligible.
- **Dependencies:** M8-T1, M7-T3/T4.

## M8-T3 · Claim Victory endpoint & transaction
- **Goal:** the atomic, server-authoritative Claim Victory (`backend.md` §9;
  `timeout_claim_rules`).
- **Scope:**
  - `handleClaimVictory(request, matchId, deps)` — one `db.transaction`: `requireUser`
    → lock → `requireMatchMembership` → status `active` (else `match_already_completed`)
    → `assertStateVersion` (race → `stale_state_version`) → **inactive-opponent** authz
    → `isClaimEligible` (else `deadline_not_expired` / `victory_claim_unavailable`) →
    `applyClaimVictory` → bump version → `persistMatchSnapshot` (stamp `completedAt`) →
    events + projections → `recordIdempotentResult` → committed-result envelope.
  - Route dispatch: `POST /api/matches/:id/actions` routes `Action.type ===
    "claim_victory"` to `handleClaimVictory` (envelope now **parses** claim_victory
    instead of rejecting it); typed failures mapped by the actions `errorResponse`.
- **Files:** `app/server/actions/claim.ts`, `envelope.ts`, `errors.ts`, `http.ts`,
  `app/api/matches/[id]/actions/route.ts`, tests (PGlite).
- **Acceptance:** the inactive opponent claims an expired-deadline match → `completed`,
  winner = claimant, `timeout_claimed`, events, `completedAt` set; a not-yet-expired
  deadline → `deadline_not_expired`; the active player claiming → `victory_claim_unavailable`
  (or `not_active_player`-analogue); a late valid action before the claim →
  `stale_state_version` on the claimant's stale version, and once refreshed the claim is
  no longer eligible (`lastActionAt` revoke); a completed match → `match_already_completed`.
- **Dependencies:** M8-T1, M8-T2.

## M8-T4 · `notification_jobs` queries, dedupe & enqueue primitives
- **Goal:** the durable-job data layer M8 schedules against (`database.md` §5.7;
  `notifications`).
- **Scope:**
  - Forward-only migration: add `dedupeKey` + `unique(match_id, player_id, type,
    dedupe_key)`.
  - `queries/notification-jobs.ts`: `enqueueNotificationJob` (`onConflictDoNothing`
    dedupe), `claimDueJobs(now, limit)` (`pending ∧ scheduledAt ≤ now`, ordered by the
    index), `markSent` / `markCancelled`, `cancelTurnJobs(matchId, playerId, key)`;
    export from `db/index.ts`.
- **Files:** `app/server/db/queries/notification-jobs.ts`, `db/index.ts`, a Drizzle
  migration + schema update, tests (PGlite).
- **Acceptance:** enqueue writes a `pending` job; a duplicate `(match, player, type,
  key)` is a no-op (dedupe); `claimDueJobs` returns only due pending jobs in schedule
  order; `markSent`/`markCancelled` transition status; `db:generate` produces exactly
  the additive migration.
- **Dependencies:** M4-T6 schema.

## M8-T5 · Enqueue on gameplay & lifecycle events
- **Goal:** schedule the five triggers as jobs at their source events, preference-aware
  and non-blocking (`notifications`; §3).
- **Scope:**
  - Post-commit enqueue (outside the gameplay atomic guarantee): on `turn_started`
    enqueue the turn-started mail (`scheduledAt = now`) + schedule `turn_reminder` (at
    20%-remaining) and `turn_expired` (at the deadline) for the newly-active player,
    unless `turnDeadline = "none"`; on turn hand-off **cancel** the prior turn's
    outstanding reminder/expired jobs; on `match_completed` (any completion path)
    enqueue completion mail to both; on M6 `join` acceptance enqueue `match_invitation`.
  - Dedupe key encodes the turn; recipient/preference gating happens at **send** time
    (T6), enqueue is unconditional but idempotent.
- **Files:** `app/server/actions/submit.ts` (+ claim/resign completion paths),
  `app/server/lifecycle/join.ts`, an enqueue helper (`app/server/notifications/enqueue.ts`),
  tests.
- **Acceptance:** ending a turn enqueues the next player's `turn_started` (now) +
  `turn_reminder` + `turn_expired` (future) and cancels the prior turn's pending
  reminder/expired; a `"none"` match schedules no reminder/expired; completion enqueues
  `match_completed` for both; a gameplay tx that commits still succeeds even if enqueue
  throws (non-blocking).
- **Dependencies:** M8-T4.

## M8-T6 · Resend delivery & the cron drain
- **Goal:** deliver due jobs via Resend without ever blocking gameplay, on a scheduled
  drain (`backend.md` §10; `notifications`).
- **Scope:**
  - A `NotificationMailer` seam + default `resendMailer`-style impl (M5 pattern; secrets
    at send time); per-`type` email content.
  - `POST /api/cron/notifications` — shared-secret guarded; `claimDueJobs` → per job,
    load the recipient's `users.notification_preferences`, skip (mark `cancelled` or
    leave) when the toggle is off, else send via the mailer and `markSent`; failures
    logged, never thrown into gameplay.
  - `vercel.json` cron entry (deploy config) invoking the drain on an interval.
- **Files:** `app/server/notifications/mailer.ts`, `app/server/notifications/drain.ts`,
  `app/api/cron/notifications/route.ts`, `vercel.json`, `auth/env.ts` (a cron secret
  accessor), tests (faked mailer, PGlite).
- **Acceptance:** the drain sends only due pending jobs whose recipient toggle is on,
  marks them `sent`, skips toggled-off recipients, and never sends real email in tests;
  an unauthorized cron call is rejected; a mailer failure marks the job unsent/retryable
  and does not crash the drain.
- **Dependencies:** M8-T4, M8-T5.

## M8-T7 · Async & notification acceptance suite
- **Goal:** prove the async + notification contract end-to-end (spec §35 #25;
  `required_validation_tests.asynchronous`; `notifications`).
- **Scope:** expired turn does not auto-end; late valid action revokes the claim; the
  claim-vs-late-action race resolves atomically (version/lock); reminder/expired
  scheduling + cancellation on hand-off; preference gating and gameplay-non-authority
  (a send failure never changes match state).
- **Files:** `app/server/actions/__tests__/claim-victory.test.ts`,
  `app/server/notifications/__tests__/*`, tests.
- **Acceptance:** the numbered async scenarios and notification guarantees pass under
  CI; nothing sends real email.
- **Dependencies:** M8-T3, M8-T6.

**Ordering:** M8-T1 → M8-T2 → M8-T3 ∥ (M8-T4 → M8-T5 → M8-T6) → M8-T7.

---

# 5. Definition of Done for M8

M8 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and `pnpm build`
   are green, and `pnpm db:generate` / `pnpm db:migrate` apply exactly the additive
   `notification_jobs` dedupe migration.
2. A passed turn deadline **does not auto-end** the turn or the match
   (`time_model.expiration.automatically_ends_turn: false`).
3. **Claim Victory** by the inactive opponent on an expired match is atomic —
   `completed`, winner = claimant, `timeout_claimed`, `victory_claimed` +
   `match_completed` — under the row lock + version compare; the typed failures
   (`deadline_not_expired`, `victory_claim_unavailable`, `stale_state_version`,
   `match_already_completed`) are correct (`timeout_claim_rules`).
4. A **late valid action revokes** the claim (`lastActionAt` marker), and the
   claim-vs-late-action race resolves atomically (spec §35 #25).
5. The five triggers enqueue **preference-gated, deduped** `notification_jobs`
   (immediate at `now`, `turn_reminder`/`turn_expired` scheduled, none for a
   `"none"` deadline); turn hand-off cancels the prior turn's outstanding jobs.
6. The cron drain delivers due jobs via the **injected** mailer, honors the
   recipient's preferences, marks `sent`, is shared-secret guarded, and **never
   blocks or alters gameplay** (`notifications.gameplay_authority: false`); no test
   sends real email.
7. The engine stays pure (no clock read); all deadline/claim time comparisons are in
   the backend. Scope stays inside async + notifications: **no** branded UI (M9),
   **no** client previews (M10), **no** `activate_power`/day-limit scoring (§33).

---

# 6. Deferred design gates & scope boundaries (not in M8)

- **The live Vercel Cron trigger** — `vercel.json` + the drain route ship, but the
  scheduled invocation is verified in the deploy environment, not locally (no
  scheduler in this workspace, analogous to the M7 CI-Postgres gate). The drain
  **handler** is fully tested with a faked mailer.
- **Fog of war** — still blocked at create (M7 §6); notification payloads carry no
  hidden board state, so fog does not gate M8.
- **`activate_power` / power-meter mail, day-limit scoring** — §33.1 / §33.2 gated,
  unchanged.
- **Real commander roster & official maps** — still fixture-driven (M6 §6).
- **Retry/backoff policy & multi-instance drain locking** — the drain marks failures
  retryable; a hardened retry schedule and cross-instance job-claim locking (SKIP
  LOCKED) are a later operational concern; the MVP single-drain is sufficient for the
  single-instance target.

---

# 7. Cross-references

- `roadmap.md` — §5 (M8 entry: deadlines, Claim Victory, Resend triggers, durable
  jobs / recomputable timestamps), §6 (no §33 blocker applies), §7 (dependencies), §12
  (Vercel + Neon deploy target).
- `backend.md` — §2 (Node.js runtime), §3 (actions endpoint carries `claim_victory`),
  §4 (pipeline, no notification step), §7 (claim_victory inactive-opponent exception),
  §8 (concurrency / row lock / typed conflict), §9 (Turn deadlines & Claim Victory),
  §10 (Notifications).
- `database.md` — §5.7 (`notification_jobs` columns + `(status, scheduled_at)` index),
  §6 (locking / version compare), §9 (forward-only migrations).
- `domain-model.md` — §5 (User.notificationPreferences), §6 (Match deadline/outcome),
  §7 (MatchPlayer claim right / §4.4), §11 (Action incl. `claim_victory`), §12 (Event),
  §14–§15 (invariants, engine reads no clock, monotonic `stateVersion`).
- `rules.yaml` — `time_model` (`supported_deadlines`, `deadline_starts`, `expiration`),
  `timeout_claim_rules`, `notifications` (`gameplay_authority`, `event_triggers`,
  `default_preferences`, `reminder`), `victory_rules` (`conditions.timeout_claim`,
  `evaluation_timing.after_claim_victory`), `enums` (`completion_reasons.timeout_claimed`,
  `action_types.claim_victory`, `event_types.victory_claimed`, `validation_error_codes`,
  `notification_type`, `notification_job_status`), `turn_sequence.end_turn.ordered_steps`
  (`clear_expired_claim_for_current_turn`), `security_rules`,
  `required_validation_tests.asynchronous`.
- `game-specification.md` — §4.3 (deadline options), §4.4 (expired turn behavior), §4.5
  (resign contrast), §23.1 (Claim Victory), §26.1–§26.3 (notifications / reminder), §34
  (DoD), §35 #25 (claim/late race).
- **Landed code composed:** engine `applyResign` / `finalizeVictory` / `evaluateVictory`
  / `resolveStartOfTurn` / `createInitialMatchState`, `MatchMeta.{turnDeadlineAt,
  expiredTurnClaimAvailableTo}` (`state.ts`); pipeline `handleSubmitAction` +
  `computeTurnDeadline` (`app/server/actions/submit.ts`, `lifecycle/turn-deadline.ts`);
  db `lockMatchForUpdate`/`assertStateVersion`/`StateVersionConflictError`/
  `persistMatchSnapshot`/`appendEvents`/`insertPlayerEvents`/`recordIdempotentResult`;
  auth `requireUser`/`requireMatchMembership`, Resend seam `MagicLinkMailer`/`resendMailer`
  + `requireResendApiKey`/`requireEmailFrom`; account `getNotificationPreferences`/
  `updateNotificationPreferences`; schema `notification-jobs.ts`, `enums.ts`
  (`NOTIFICATION_TYPES`, `NOTIFICATION_JOB_STATUSES`), `users.ts`
  (`DEFAULT_NOTIFICATION_PREFERENCES`).
- `definition-of-ready.md` — the entry gate each ticket satisfies.
