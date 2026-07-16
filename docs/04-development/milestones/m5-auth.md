# Iron Grid — M5 · Auth & account (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Backend / auth contributors

> This is the **execution-detail** breakdown of milestone **M5** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the authentication and authorization contract is
> canonical in `backend.md` §7 (with §2 runtime, §3 the API surface, §10
> notifications, §12 security); the identity tables it wires were landed in M4 and
> are specified in `database.md` §5.1; the entity it authenticates is
> `domain-model.md` §5 (User); the persistence-only contracts are `rules.yaml` →
> `security_rules`, `notifications`; the exit gate is `game-specification.md` §34,
> `testing.md` §6, and `coding-standards.md` §11–§12.

---

# 1. Purpose

M5 continues **Phase 2 — Server**. On the validated schema M4 landed, it builds
the **identity and access layer** the rest of the server authorizes against:
Auth.js magic-link sign-in delivered by Resend, the session that resolves a
`User`, the **match-membership authorization primitive** enforced on every read
and write (`backend.md` §7, `security_rules`), and the account endpoint that reads
and updates a user's notification preferences (`backend.md` §3, §10).

M5 is **authentication, session and authorization only**. It wires the Auth.js
Drizzle adapter to the `users` / `accounts` / `sessions` / `verification_tokens`
tables **already created in M4-T2** (`database.md` §5.1) — it does **not** invent
new identity schema — and it delivers the **membership guard as a reusable
primitive**, not yet composed into an endpoint. The lifecycle API that consumes it
(`create`/`join`/`commander`/`ready`/`cancel`) is **M6**, the transactional action
pipeline that runs `authenticate_player` → `authorize_match_membership` at its head
is **M7**, and the scheduling and **delivery** of gameplay notification emails is
**M8**. M5 gives those layers a working session, a `requireUser` helper, a
membership check they call, and stored preferences they read.

The magic-link email is **transactional auth mail** — it is not a gameplay
notification. The five `notifications.event_triggers` (invitation, turn started,
turn reminder, turn expired, match completed) are scheduled and sent in **M8**; M5
only **stores and edits** their per-user toggles (`database.md` §5.1, spec §26.2).

Following the layer order (`architecture.md` §3, §4), the auth module is
**server-only** and one-directional: it may import the full stack (`@auth/core`,
`@auth/drizzle-adapter`, `resend`, the db layer) and is **never** imported by
`game-engine` or `game-data` — `@auth/core` and `resend` are already in the
engine's `forbidden_dependencies` (`rules.yaml` → `engine_contract`).

**Current state** (starting point): the repo is the finished M4 workspace — the
full `app/server/db` schema, client, query helpers and PGlite test harness, with
`users` + the Auth.js adapter tables landed as DDL (M4-T2). **No `next-auth` /
`@auth/*`, no `resend` is installed**, there is no auth config, no session helper,
no `/api/auth/*` or `/api/me/*` route, and no membership guard. The `state`
mirrors, event store and concurrency/versioning primitives exist but nothing
authenticates or authorizes access to them yet.

---

# 2. Gates for M5

- **Entry (DoR):** each ticket is specified with goal, scope, files and
  acceptance; the identity it authenticates is `domain-model.md` §5, its tables
  exist from M4-T2, and its contract is `backend.md` §7. **No open §33 blocker
  applies to M5's scope** — auth and account touch no commander effect, no
  day-limit score and no gated art; they read `email`, sessions and opaque
  notification-preference JSON. The §33.1–§33.5 blockers do **not** gate this
  milestone.
- **Exit (DoD):** the **auth/account slice** of the Functional Definition of Done
  — magic-link sign-in works end-to-end against the test harness, a session
  resolves a `User`, membership is validated on every read and write by a tested
  primitive, and `/api/me/notifications` reads and updates preferences — plus the
  code-change bar (`coding-standards.md` §11–§12: `tsc`/`next build`, `pnpm lint`,
  `cspell`). The **lifecycle** endpoints (M6), the **action pipeline** (M7) and
  notification **scheduling/delivery** (M8) belong to the layers that add them; M5
  lands the identity, session and authorization they compose. The milestone-level
  DoD is in §5.

---

# 3. Cross-cutting decisions

- **Wire the M4 adapter tables, do not redefine identity schema** (`database.md`
  §5.1, M4-T2): the Auth.js Drizzle adapter binds to the existing `users`,
  `accounts`, `sessions` and `verification_tokens` Drizzle models — whose property
  names were authored to match `@auth/drizzle-adapter`. M5 introduces **no new
  identity migration**. If the adapter version demands a column M4 did not land,
  that is a **forward-only** additive migration (`database.md` §9) with a note, not
  a rewrite — the expected outcome is zero schema surprises.
- **The auth layer is server-only and one-directional** (`architecture.md` §4,
  `backend.md` §2): the Auth.js config, provider, session helper and membership
  guard live under `app/server/auth` on the **Node.js runtime** (they reach the
  transactional db and row locks). They are **never** imported by `game-engine` or
  `game-data`; the forbidden-import guard (M4-T1) is **extended** to cover the auth
  module (`server/(db|auth)`), and `@auth/core` / `resend` stay in the engine's
  `forbidden_dependencies`.
- **Secrets are injected via typed env, never ambient** — consistent with M4's
  `env.ts` discipline (read at call time, never at module load, so importing the
  layer performs no I/O): typed accessors for `AUTH_SECRET`, `RESEND_API_KEY` and
  the sender identity (`EMAIL_FROM`), each throwing a documented error when unset.
  No `process.env` read scattered at a call-site.
- **Authorization is a reusable primitive, not the pipeline** (`backend.md` §7,
  `security_rules`, `roadmap.md` §5): M5 delivers `requireUser` (resolve the
  session `User` or reject) and `requireMatchMembership(userId, matchId)` (the
  session is host or accepted guest, else a **typed 401/403**; returns the
  `MatchPlayer` / role) as standalone, tested functions. They are **not** wired
  into a lifecycle or action endpoint (M6/M7 compose them into
  `action_processing.ordered_steps`). The only endpoint M5 ships is the
  **self-authorized** account endpoint.
- **Auth mail ≠ gameplay notifications** (`backend.md` §7 vs §10): the magic-link
  email is transactional sign-in mail delivered by Resend as part of the auth flow.
  The five `notifications.event_triggers` are gameplay mail — **scheduled and sent
  in M8**. M5 stores and edits the per-user toggles (`users.notification_preferences`,
  seeded with M4's `DEFAULT_NOTIFICATION_PREFERENCES`) and sends **no** gameplay
  email.
- **Rate limits belong to their endpoints** (`security_rules`,
  `invitation_rate_limit_required` / `action_rate_limit_required`): invitation and
  action rate limiting land with the lifecycle (M6) and action (M7) endpoints that
  they bound. M5 adds no gameplay-action surface to limit; sign-in throttling
  follows the Auth.js provider defaults and is noted, not built out here.
- **Branded UI is M9** (`roadmap.md` §9, `frontend.md`): M5 delivers the working
  magic-link flow end-to-end — email entry through the Auth.js sign-in route to an
  established session. The polished sign-in / account screens are **App shell**
  (M9); M5 relies on the framework's minimal sign-in surface, not a designed page.
- **Test hermeticity reuses the M4 boundary** (`testing.md` §6): the membership
  guard, session resolution and the notifications endpoint are integration-tested
  against the **in-process Postgres** (PGlite) harness from M4-T1, with the Resend
  client **injected/faked** so no test sends real email. The full end-to-end
  transactional authorization suites over live lifecycle/action endpoints arrive
  with M6/M7.

---

# 4. Tickets

## M5-T1 · Auth toolchain, Auth.js core & Drizzle-adapter wiring
- **Goal:** install the auth toolchain and wire Auth.js to the M4 identity tables,
  establishing the server-only auth module boundary (`backend.md` §2, §7;
  `architecture.md` §4).
- **Scope:**
  - Add root-app deps: `next-auth` (Auth.js v5 / `@auth/core`),
    `@auth/drizzle-adapter`, `resend`. *(No new identity schema — the adapter binds
    to M4-T2's tables, §3.)*
  - The Auth.js **config** (`app/server/auth/config.ts`): the `DrizzleAdapter`
    over the existing `users` / `accounts` / `sessions` / `verification_tokens`
    models, session strategy, and the exported `auth` / handlers on the **Node.js
    runtime**. Provider registration is filled in by T2.
  - Typed env access (`app/server/auth/env.ts`) for `AUTH_SECRET` (and the values
    T2 needs), mirroring `db/env.ts` — read at call time, throw when unset, no
    ambient reads elsewhere.
  - **Extend the forbidden-import guard** (M4-T1) so `game-engine` and `game-data`
    reference nothing under `app/server/auth` as well as `app/server/db`
    (`server/(db|auth)`).
  - The `/api/auth/[...nextauth]/route.ts` handler mounting Auth.js on the App
    Router (`backend.md` §3 — `/api/auth/*`).
- **Files:** `app/server/auth/config.ts`, `app/server/auth/env.ts`,
  `app/server/auth/index.ts` (barrel), `app/api/auth/[...nextauth]/route.ts`,
  root `package.json` (deps), the extended guard test.
- **Acceptance:** the app type-checks and builds with the adapter bound to the M4
  tables and **no new identity migration** generated; the auth config imports on
  the Node runtime without reading env at load; the extended forbidden-import guard
  passes; `tsc`/`lint`/`cspell` green.
- **Dependencies:** M4-T1 (tooling, env pattern, guard), M4-T2 (identity tables).

## M5-T2 · Magic-link sign-in via Resend
- **Goal:** end-to-end magic-link authentication — request a link, deliver it via
  Resend, verify it, establish a session (`backend.md` §7; spec §1.3, §26.1).
- **Scope:**
  - Register the Auth.js **email / magic-link provider** in the T1 config, backed
    by the `verification_tokens` table (M4-T2) for issuance and single-use
    consumption.
  - The **Resend delivery** path (`sendVerificationRequest`): a typed Resend client
    from `RESEND_API_KEY` / `EMAIL_FROM` (T1 env), the sign-in email content, and
    error surfacing when delivery fails. The Resend client is **injectable** so
    tests fake it (§3).
  - Confirm the callback establishes a session for the returned `User` and that a
    **first-time** email provisions a `users` row with M4's
    `DEFAULT_NOTIFICATION_PREFERENCES` applied.
  - This is **transactional auth mail only** — not a gameplay notification (§3,
    `backend.md` §10). No `notifications.event_triggers` mail is sent here.
- **Files:** `app/server/auth/providers/magic-link.ts` (provider + Resend send),
  `app/server/auth/config.ts` (register provider), env additions in
  `app/server/auth/env.ts`, tests (faked Resend, PGlite).
- **Acceptance:** requesting sign-in writes a `verification_tokens` row and invokes
  the (faked) Resend send with the target address; consuming a valid token
  establishes a session and resolves the `User`; a consumed/expired token is
  rejected; a first-time sign-in creates the `users` row with default preferences;
  no real email is sent in tests.
- **Dependencies:** M5-T1; M4-T2 (`verification_tokens`, `users` defaults).

## M5-T3 · Session resolution & current-user server helper
- **Goal:** the server-side primitive that resolves the authenticated `User` for
  any route handler or pipeline step (`backend.md` §7; `domain-model.md` §5).
- **Scope:**
  - `getCurrentUser()` — resolve the Auth.js session to a `User` (or `null`) on the
    Node runtime — and `requireUser()` — return the `User` or raise the **typed
    401** (unauthenticated), for use as the `authenticate_player` step M7 composes.
  - A typed session shape carrying the stable `user.id` (`domain-model.md` §5), so
    downstream membership checks key off it rather than re-reading the session.
  - Sign-out wiring exposed through the Auth.js handlers (no bespoke endpoint).
- **Files:** `app/server/auth/session.ts` (`getCurrentUser` / `requireUser`,
  typed session), barrel update, tests (PGlite, seeded session).
- **Acceptance:** with a valid session `getCurrentUser` returns the matching `User`
  and `requireUser` returns it; with no/expired session `getCurrentUser` returns
  `null` and `requireUser` raises the typed 401; the resolved `user.id` matches the
  `users` row; no auth logic leaks a session token into logs
  (`security_rules.hidden_state_log_redaction_required`).
- **Dependencies:** M5-T1 (config), M5-T2 (a session exists to resolve).

## M5-T4 · Match-membership authorization guard
- **Goal:** the reusable authorization primitive that validates match membership on
  **every** read and write (`backend.md` §7, §12;
  `security_rules.validate_membership_on_every_read` / `_on_every_write`).
- **Scope:**
  - `requireMatchMembership(userId, matchId)` — resolve the `match_players` row for
    `(matchId, userId)`; a session that is neither **host** nor **accepted guest**
    is rejected with a **typed 403**; a missing match with the appropriate typed
    error. Returns the `MatchPlayer` / role so callers need not re-query
    (`domain-model.md` §7).
  - It reads through the db layer and honors the accepted-guest condition
    (`user_id` non-null on the guest row, M4-T4). It is a **standalone** function —
    **not** wired into a lifecycle or action endpoint (M6/M7 place it at the head of
    their flows, `backend.md` §4).
  - The guard never ships hidden state and never distinguishes "not a member" in a
    way that leaks match existence beyond the typed contract.
- **Files:** `app/server/auth/membership.ts`, barrel update, tests (PGlite: host
  accepted, guest accepted, non-member rejected, unknown match).
- **Acceptance:** the host and the accepted guest pass and receive their role; a
  user with no `match_players` row for the match is rejected with the typed 403; an
  unaccepted/`null`-`user_id` guest row does not grant access; the guard performs a
  membership check on both a representative read path and write path in tests; it is
  invoked by **no** endpoint yet.
- **Dependencies:** M5-T3 (`requireUser` / `user.id`); M4-T3 (`matches`), M4-T4
  (`match_players`).

## M5-T5 · Notification-preferences account endpoint
- **Goal:** the account API to read and update a user's notification preferences
  (`backend.md` §3, §10; spec §26.2; `database.md` §5.1) — **preferences only**, no
  gameplay-mail delivery (M8).
- **Scope:**
  - `GET /api/me/notifications` — return the authenticated user's
    `notification_preferences` (`requireUser`, T3; **self-authorized**, no match
    membership involved).
  - `PATCH /api/me/notifications` — update one or more toggles, **validated against
    the exact `notifications.default_preferences` keys** (invitation, turn started,
    turn reminder, turn expired, match completed — no invented key), persisted to
    `users.notification_preferences`, returning the updated set. Unknown keys are
    rejected; omitted keys are unchanged.
  - No email is sent and no `notification_jobs` row is written — those triggers are
    M8. This endpoint only stores the user's intent.
- **Files:** `app/api/me/notifications/route.ts`, a small preferences
  validator/helper (reusing M4's `NotificationPreferences` type +
  `DEFAULT_NOTIFICATION_PREFERENCES`), tests (PGlite).
- **Acceptance:** `GET` returns the stored preferences (defaults for a fresh user);
  `PATCH` updates the targeted toggles and leaves the rest intact; an unknown or
  malformed key is rejected; an unauthenticated request gets the typed 401; the
  accepted keys match `rules.yaml` → `notifications.default_preferences` exactly; no
  email is sent.
- **Dependencies:** M5-T3 (`requireUser`); M4-T2 (`users.notification_preferences`,
  defaults).

**Ordering:** M5-T1 → { M5-T2 ∥ M5-T3 } → { M5-T4 ∥ M5-T5 }.
(T2 and T3 both extend T1's Auth.js config — T2 adds the magic-link provider and
Resend delivery, T3 the session/current-user helper — and can be authored in
parallel and reconciled in the config. T4 and T5 both build on T3's `requireUser`:
T4 the match-membership guard, T5 the self-authorized account endpoint.)

---

# 5. Definition of Done for M5

M5 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and
   `pnpm build` are all green, and `pnpm db:generate` / `pnpm db:migrate` report
   **no new identity migration** (the adapter binds to the M4-T2 tables) — or, if
   the adapter demands one, a single forward-only additive migration that applies
   cleanly against the M4 schema.
2. **Magic-link sign-in works end-to-end** against the test harness: requesting a
   link writes a `verification_tokens` row and invokes the (faked) Resend send;
   consuming a valid token establishes a session; a first-time email provisions a
   `users` row with `DEFAULT_NOTIFICATION_PREFERENCES` (`backend.md` §7, spec §1.3).
3. The **primitives** are implemented and tested: `requireUser` (typed 401 when
   unauthenticated), `requireMatchMembership` (typed 403 for a non-member; host and
   accepted guest pass with their role), enforcing
   `validate_membership_on_every_read` / `_on_every_write` — **not** wired into a
   lifecycle or action endpoint yet.
4. `GET/PATCH /api/me/notifications` reads and updates
   `users.notification_preferences`, validated against the exact
   `notifications.default_preferences` keys, self-authorized, sending **no** email
   (`backend.md` §3, §10; spec §26.2).
5. The auth layer is server-only and one-directional: the extended forbidden-import
   guard proves `game-engine` and `game-data` reference nothing under
   `app/server/auth` (or `app/server/db`); secrets are read through typed env
   accessors at call time, never from ambient reads, and no session token or
   secret is written to logs (`security_rules.hidden_state_log_redaction_required`).
6. Integration tests (`testing.md` §6) cover: the magic-link issue→consume→session
   flow (faked Resend), session resolution, the membership guard on a read and a
   write path (host/guest accepted, non-member rejected), and the notifications
   endpoint round-trip and validation — green under CI.
7. Scope stays inside auth/account: **no** lifecycle endpoints (M6), **no** action
   pipeline or `authorize_match_membership` wiring into a live mutation (M7), **no**
   notification scheduling or gameplay-mail delivery (M8), **no** branded sign-in /
   account UI (M9). Those layers find a working session, the `requireUser` and
   membership primitives, and stored preferences, and add their behavior on top.

---

# 6. Cross-references

- `roadmap.md` — M5's place in the sequence (§5), the layered strategy (§2), and
  the §33 blocker map (§6) — none gate M5.
- `backend.md` — §2 runtime (Node.js for the auth/session/membership path), §3 the
  API surface (`/api/auth/*`, `/api/me/notifications`), §7 authentication and
  authorization (the canonical contract), §10 notifications (preferences here,
  delivery in M8), §12 security and log redaction.
- `database.md` — §5.1 the `users` + Auth.js adapter tables M5 wires; §9 the
  forward-only migration rule if the adapter needs an additive column; §11 the
  server-only boundary.
- `domain-model.md` — §5 User (the identity a session resolves), §7 MatchPlayer
  (the membership the guard checks).
- `rules.yaml` → `security_rules` (`validate_membership_on_every_read` /
  `_on_every_write`, log redaction, rate-limit obligations), `notifications`
  (triggers, `default_preferences`), `engine_contract.forbidden_dependencies`
  (`@auth/core`, `resend`).
- `architecture.md` — §3–§4 the package boundary and forbidden dependencies (the
  auth module joins the db module behind the server-only line).
- `testing.md` — §6 the backend/integration test layer and its authorization
  obligations; §12 the Vitest/CI wiring.
- `definition-of-ready.md` — the entry gate each ticket satisfies.
- `game-specification.md` — §1.3 (magic-link auth, email notifications in MVP),
  §25 (concurrent sessions), §26 (notifications & preferences), §29 (security /
  membership on every read/write), §34 (Definition of Done — server authorization
  tests).
