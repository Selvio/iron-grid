# Iron Grid — M9 · App shell & lifecycle screens (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Frontend / QA / AI contributors

> This is the **execution-detail** breakdown of milestone **M9** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place is
> `roadmap.md` §5 (lines 172–176) and its Phase-3 header; the frontend contract is
> `frontend.md` §1–§3, §9, §10 (the App-Router shell, the React/Phaser split, state
> sync, accessibility); the UI/tooling stack is `decisions/0001-frontend-ui-and-tooling-stack.md`;
> the design system is `design-reference.md` §4–§5; the flows are
> `game-specification.md` §3 (lifecycle), §23 (victory reasons), §26.2 (notification
> preferences), §27 (interaction/accessibility). It **composes the landed M5–M8
> server**: Auth.js (`app/server/auth`), the M6 lifecycle handlers, M7's
> `GET /api/matches/:id` read model, and the M5 `GET/PATCH /api/me/notifications`
> account API. The exit gate is `game-specification.md` §34 (the UI slice of the
> Functional Definition of Done) and `coding-standards.md` §11–§12.

---

# 1. Purpose

M9 opens **Phase 3 — Client**. It builds the **branded application shell** and the
**lifecycle screens** in React DOM, consuming the server surface M5–M8 already ship.
It delivers, per `roadmap.md` §5: a signed-in **dashboard** (a player's matches,
"your turn" vs "waiting", deadline countdowns), **create match**, **invite / join**,
**commander selection** (placeholder names — §33.1), **ready check**, **match
completed**, plus the shell's entry and account surfaces that `frontend.md` §2
assigns to the App Router — **sign-in / session UI** and the **account /
notification-preferences** screen. Forms use **react-hook-form + Zod** (`roadmap.md`
§5; `coding-standards.md` §9). The whole surface is **DOM-only** (`frontend.md` §2,
`design-reference.md` §3).

M9 makes the frontend architecture decisions the docs leave open but bounded:
**data-fetching is same-origin `fetch` over a small typed client** carrying the
Auth.js **session cookie** — no bearer tokens, no SWR/React-Query (`frontend.md` §2,
§9); **auth-gated reads are React Server Components** calling `auth()` directly,
while **interactive forms and lists are client components** (react-hook-form + a
client fetch helper); the client stays a **thin view over server-authoritative
state** and reconciles by refetching, never by re-applying logic locally
(`frontend.md` §9).

M9 **stops before the battlefield**. It renders **no game board**: the Phaser
`<canvas>`, the projected tilemap, the `select→range→destination→preview→confirm→
submit→animate` loop, and in-browser engine previews are **M10** (`roadmap.md` §5
lines 178–186; `frontend.md` §2, §3; `design-reference.md` §3 — the mockup board is a
"stand-in for the Phaser `<canvas>`"). Opponent-turn replay is **M11**. M9 builds the
React DOM shell **around** the board — never the board.

**Current state** (starting point): the finished, verified M5–M8 backend plus a bare
**Next starter** that M9 replaces. `app/layout.tsx` (Geist fonts, `title: "Create
Next App"`), `app/page.tsx` (the Next template), and `app/globals.css` (Geist tokens)
are untouched scaffold. No UI stack is installed — **`package.json` has `next 16`,
`react 19`, `tailwindcss ^4`, `vitest ^4`, `next-auth v5`, but no `shadcn/ui`, no
`lucide-react`, no `react-hook-form` / `@hookform/resolvers`, no root `zod` (only
`game-data` has it), no `@testing-library/react` / `jsdom`, no Phaser** (correctly
deferred to M10). Auth is fully wired (`app/server/auth` exports `auth`, `signIn`,
`signOut`, `handlers`; the session carries `user.id`); the M6 lifecycle handlers,
M7's `GET /api/matches/:id` (`MatchView`), and `GET/PATCH /api/me/notifications` are
live. **One read endpoint is missing** and M9 adds it: there is **no
`GET /api/matches`** to enumerate a user's matches — `app/api/matches/route.ts`
exports only `POST` — so the dashboard has nothing to list against (see M9-T4).

---

# 2. Gates for M9

- **Entry (DoR):** each ticket is specified with goal/scope/files/acceptance; the
  server surface it consumes is landed and verified (M5–M8); the UI/tooling stack is
  canonical (`decisions/0001`); the design system and screen inventory are committed
  (`design-reference.md` §4–§5, `docs/05-design/screenshots/`). The only **open §33
  blocker touching M9 is §33.1** (commander names/art) — handled by rendering
  **placeholder** commander labels (`roadmap.md` §5; `commanders.yaml`
  `document_status: "design-blocked"`, all `display_name: null`). §33.3/§33.4
  (property/terrain art) and §9.5 (sprite-row mapping) gate **M10**, not M9 (M9
  renders no board). §33.2 (day-limit **score** display) stays out of scope: the
  create form accepts a `dayLimit` value but M9 builds no score UI.
- **Exit (DoD):** the **UI slice** of the Functional Definition of Done
  (`game-specification.md` §34): a player can sign in, see their matches, create a
  match and share its invitation, join by code, pick a (placeholder) commander,
  ready-up, watch the match reach `active`, see a completed match's winner + reason,
  and manage notification preferences — every screen branded per `design-reference.md`
  §4, keyboard-accessible and honoring `prefers-reduced-motion` (`frontend.md` §10),
  fed only by server-authoritative HTTP with no client-side game logic
  (`frontend.md` §9) — plus the code-change bar (`coding-standards.md` §11–§12). It
  runs against a **faked/mocked API** in component tests (RTL + jsdom); the live
  end-to-end flow against a running server is exercised in M12 acceptance. The
  milestone DoD is §5.

---

# 3. Cross-cutting decisions

- **App-Router shell, DOM-only, no board** (`frontend.md` §2–§3). Every M9 surface is
  React DOM under `app/`. Phaser is **not installed** and **not imported**; nothing in
  M9 renders a tilemap, sprite, or the projected board — that is M10. `game-engine` /
  `game-data` are **never imported by the client** for I/O (`architecture.md` §4);
  where M9 needs shared shapes (e.g. `MatchView`, `Action`, the notification-preference
  keys) it imports **types** from the server/engine boundary, not runtime logic.
- **Data-fetching = same-origin `fetch` + a typed client; auth = the session cookie**
  (`frontend.md` §2, §9). No SWR / React Query (unspecified by the docs → we keep the
  dependency surface minimal and the "thin view" honest). A small `app/lib/api-client`
  wraps every endpoint in §E with typed request/response shapes and a uniform typed-error
  decode (`{ error: code }`, plus `currentStateVersion` on 409). Requests are
  same-origin so the Auth.js **session cookie rides automatically** — the client holds
  **no token**. Auth-gated **reads** are React Server Components that call `auth()` and
  fetch server-side; **mutations and interactive lists** are client components using
  the client fetch helper. The client **never re-applies game logic**; on a `409`
  conflict it **refetches** the authoritative view (`frontend.md` §9).
- **Forms are react-hook-form + Zod mirroring the server's validation boundary**
  (`roadmap.md` §5; `coding-standards.md` §9). Each form's Zod schema encodes exactly
  the server's accepted shape (`rules.yaml → match_lifecycle.creation.allowed_configuration`
  for create; the join code; the commander id) so invalid input is caught inline
  **and** the server stays the authority — a server `400/422` `{ error, codes }` is
  surfaced, never swallowed. The backend hand-wrote its request validators (it does
  **not** export shared Zod schemas), so M9 authors the form schemas to match the
  documented contract; they are a client convenience, not the source of truth.
- **The design system is applied, the mockup is illustrative** (`design-reference.md`
  §3–§4). Dark-by-default with a light variant; **Manrope** (UI) + **JetBrains Mono**
  (numeric readouts); **shadcn/ui** components (Radix + Tailwind v4) + **lucide-react**
  icons. **Faction identity is color _plus_ a distinct insignia, never color alone**
  (`game-specification.md` §27.4, `frontend.md` §10) — a shared `FactionBadge` enforces
  this. HP renders `0–10`, funds in a generic `G`, deadlines as **countdowns**. Where
  the `docs/05-design` mockup disagrees with `frontend.md`/`game-specification.md`,
  those win (§3) — notably: motion honors `prefers-reduced-motion` by default (not a
  Tweaks toggle), and the create form does **not** offer an enabled fog path.
- **Commanders are placeholders; fog is forced off** — the two live content gates.
  §33.1: the commander-select UI shows the four factions/commanders with **placeholder
  labels** and invents no names (`commanders.yaml` all `display_name: null`;
  `commander_rules.hardcoded_commander_names_forbidden: true`). Selection uniqueness
  (`duplicate_selection_allowed: false`, `one_per_faction: true`) is reflected from the
  server response, not decided client-side. The backend **rejects `fogEnabled: true`**
  (M7 create guard), so the create form **omits or disables** the fog toggle and never
  submits fog on. Pick-**ordering** (strict server-random first/second) remains
  deferred (the M4 schema lacks a pick-order column) — M9 rides the any-order backend
  and does not deliver ordering.
- **Testing is component-level: RTL + jsdom, a new Vitest `ui` project**
  (`testing.md`; `decisions/0001`). A `jsdom`/`happy-dom` Vitest project with
  `@testing-library/react` + `@testing-library/user-event` renders each screen and
  form, asserting render, interaction, the fetch calls made (mocked client), and typed-error
  surfacing. The existing node-environment backend projects are untouched; the `ui`
  project is additive. Live end-to-end (real server + DB) is **M12**, not M9.
- **The dashboard needs a read endpoint M9 adds** (§E gap). `GET /api/matches` — a thin
  `requireUser` handler listing the caller's matches via `matchPlayers` — is folded
  into M9-T4. It is server work inside a frontend milestone, scoped to the minimum the
  dashboard consumes (no new gameplay surface).

---

# 4. Tickets

## M9-T1 · Shell foundation & UI toolchain
- **Goal:** the branded app shell and the UI/test toolchain every later ticket builds
  on (`decisions/0001`; `frontend.md` §2; `design-reference.md` §4).
- **Scope:**
  - Install the stack: `shadcn/ui` (its Radix primitives) + `lucide-react` +
    `react-hook-form` + `@hookform/resolvers` + root `zod`; wire **Manrope** +
    **JetBrains Mono** via `next/font/google`, replacing Geist.
  - Replace the starter: `app/layout.tsx` (branded metadata, fonts, the theme
    provider, the top-nav app-shell chrome), `app/page.tsx` (the signed-out landing /
    signed-in redirect to the dashboard), `app/globals.css` (dark-default + light
    Tailwind-v4 theme tokens per the palette).
  - Shared primitives under `app/components/ui` / `app/lib`: `FactionBadge`
    (color **+** insignia), formatters (`G`-funds, HP `0–10`, deadline **countdown**),
    an auth-gated shell boundary, and the `prefers-reduced-motion` default.
  - Testing: add a Vitest **`ui`** project (`jsdom`, `@testing-library/react` +
    `@testing-library/user-event`, jest-dom matchers) alongside the node projects; a
    smoke test renders the shell.
- **Files:** `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
  `app/components/ui/*`, `app/lib/format.ts`, `vitest.config.*` / project config,
  `components.json` (shadcn), tests.
- **Acceptance:** `pnpm build` renders the branded shell (Manrope/JetBrains, dark
  default) with no Geist/"Create Next App" residue; `FactionBadge` renders a
  non-color-only identity; the `ui` Vitest project runs and the shell smoke test
  passes; `pnpm -r typecheck`/`lint`/`spell` green.
- **Dependencies:** none (composes landed M5 auth for the shell boundary).

## M9-T2 · Sign-in surface & session gating
- **Goal:** the shell's authenticated boundary — sign in, sign out, gate
  (`frontend.md` §2; M5 auth, landed).
- **Scope:**
  - A sign-in screen driving Auth.js **magic-link** `signIn` (email form → "check your
    inbox" state), and `signOut` from the shell nav.
  - Server-side gating: auth-gated routes are RSCs calling `auth()`; unauthenticated
    access redirects to sign-in; the signed-in shell shows the user's identity.
  - No new auth backend — M9 only builds the UI over the landed flow (`requireUser`,
    session `user.id`).
- **Files:** `app/(auth)/sign-in/page.tsx`, shell nav components, an auth-gate helper
  (`app/lib/session.ts` wrapping `auth()`), tests.
- **Acceptance:** an unauthenticated visit to a gated route redirects to sign-in;
  submitting an email calls `signIn` (magic-link) and shows the sent state; `signOut`
  clears the session; a signed-in visit renders the shell. Component tests mock the
  auth actions.
- **Dependencies:** M9-T1.

## M9-T3 · Typed API client & form-validation layer
- **Goal:** the single typed seam the UI calls the server through, plus the shared
  form schemas (`frontend.md` §2, §9; `coding-standards.md` §9; §3).
- **Scope:**
  - `app/lib/api-client.ts`: typed wrappers for every §E endpoint (request/response
    shapes; uniform typed-error decode — `{ error: code }`, `currentStateVersion` on
    409, `codes` on validation failure) over same-origin `fetch` (cookie session).
  - `app/lib/schemas.ts`: Zod schemas mirroring the server's accepted shapes (create
    settings, join code, commander id) for react-hook-form resolvers.
  - Shared client types imported from the server/engine boundary (`MatchView`, the
    notification-preference keys, `Action` where needed) — **types only**.
- **Files:** `app/lib/api-client.ts`, `app/lib/schemas.ts`, type re-exports, tests.
- **Acceptance:** each client method issues the correct method/path/body and decodes
  success and each typed error; the Zod schemas accept the documented valid shapes and
  reject the invalid ones; no runtime engine/data import crosses into the client.
- **Dependencies:** M9-T1.

## M9-T4 · `GET /api/matches` list endpoint & dashboard
- **Goal:** the signed-in home — a player's matches with status and deadlines
  (`roadmap.md` §5; `design-reference.md` §5 `match-dashboard`).
- **Scope:**
  - **Backend (folded in):** `GET /api/matches` — a `requireUser`, `nodejs`-runtime
    handler listing the caller's matches via `matchPlayers` (join `matches`), returning
    `[{ matchId, status, role, activePlayerId, turnDeadlineAt, ... }]`; a query helper
    + tests (PGlite). No new gameplay surface.
  - **UI:** the dashboard groups matches into **"your turn"** vs **"waiting for
    opponent"** vs pre-active/completed, with **deadline countdowns**, an empty state,
    and a "Create match" CTA. RSC fetch of the list; client countdown rendering.
- **Files:** `app/api/matches/route.ts` (add `GET`),
  `app/server/db/queries/matches.ts` (a list query) + `db/index.ts`,
  `app/(app)/dashboard/page.tsx`, dashboard components, tests (route PGlite + UI RTL).
- **Acceptance:** `GET /api/matches` returns only the caller's matches (membership
  scoped), 401 when unauthenticated; the dashboard renders the groups and countdowns
  from the list, shows the empty state with the CTA, and links each match to its
  lifecycle screen; `db:generate` produces no schema change (read-only).
- **Dependencies:** M9-T2, M9-T3.

## M9-T5 · Create match
- **Goal:** create a match and share its invitation (`roadmap.md` §5;
  `design-reference.md` §5 `create-match`; `POST /api/matches`).
- **Scope:** a react-hook-form + Zod form for `mapId` / `turnDeadline`
  (`24h`/`3d`/`7d`/`none`) / `dayLimit`, with **fog forced off** (omitted or disabled,
  never submitted true); on `201` show the **invitation code / shareable link** and a
  path onward; inline validation from the schema, server `400/422` surfaced.
- **Files:** `app/(app)/matches/new/page.tsx`, create-form components, tests.
- **Acceptance:** a valid submit POSTs the exact create body and renders the returned
  `invitationCode` + `status: "waiting_for_opponent"`; fog cannot be submitted on;
  invalid input shows inline errors without a request; a server error is surfaced.
- **Dependencies:** M9-T3.

## M9-T6 · Join, commander selection & ready check
- **Goal:** the pre-active lifecycle forms from join through ready
  (`roadmap.md` §5; `game-specification.md` §3; `design-reference.md` §5
  `invite-join`/`commander-select`/`ready-check`).
- **Scope:**
  - **Join:** a code form → `POST /api/matches/:id/join`, advancing to
    `commander_selection`.
  - **Commander select:** the four factions/commanders with **placeholder labels**
    (§33.1), selection → `POST …/commander`; uniqueness + the `ready_check` transition
    reflected from the server response (no client-side pick rules); names never
    hard-coded.
  - **Ready check:** both-players-confirm UI → `POST …/ready`, reflecting the
    `ready_check → active` transition; the hand-off to the battlefield (M10) is a link,
    not a board.
- **Files:** `app/(app)/matches/[id]/join/page.tsx`,
  `app/(app)/matches/[id]/commander/page.tsx`,
  `app/(app)/matches/[id]/ready/page.tsx`, lifecycle-form components, tests.
- **Acceptance:** joining by code advances to commander selection; picking a commander
  posts the id and reflects `commander_selection`→`ready_check` per the server; a taken
  faction/commander is shown unavailable from the server state; readying reflects
  `active`; placeholder commander labels contain no invented names.
- **Dependencies:** M9-T3 (∥ M9-T5).

## M9-T7 · Match completed & account / notification preferences
- **Goal:** the terminal match screen and the account surface (`roadmap.md` §5;
  `game-specification.md` §23, §26.2; `design-reference.md` §5
  `match-completed`; `GET/PATCH /api/me/notifications`).
- **Scope:**
  - **Match completed:** read `GET /api/matches/:id` (`MatchView.status` /
    `winnerPlayerId` / `completionReason`) and render winner + reason (HQ captured /
    army eliminated / timeout claimed / resignation, `game-specification.md` §23) — a
    **fetched** view, since M9 submits no actions.
  - **Account / notifications:** a toggle screen over `GET/PATCH /api/me/notifications`
    for the five keys (`match_invitation`, `turn_started`, `turn_reminder`,
    `turn_expired`, `match_completed`; defaults all true except `turn_expired`),
    optimistic-then-reconcile against the returned preferences.
- **Files:** `app/(app)/matches/[id]/completed/page.tsx`,
  `app/(app)/account/notifications/page.tsx`, components, tests.
- **Acceptance:** a completed match shows the correct winner and reason from the read
  model; the notifications screen loads current preferences, PATCHes a toggled key, and
  reflects the server's returned state; a failed PATCH reverts and surfaces the error.
- **Dependencies:** M9-T3.

## M9-T8 · UI acceptance suite
- **Goal:** prove the lifecycle-screen slice of the UI DoD under CI
  (`game-specification.md` §34; `testing.md`).
- **Scope:** RTL + jsdom coverage across the shell — sign-in gate, dashboard grouping
  and countdowns, create (fog-off + invitation), join→commander(placeholder)→ready
  transitions driven by mocked server responses, completed-match reason, and the
  notification-preference round-trip; accessibility assertions (keyboard focus, the
  non-color-only faction identity, reduced-motion default).
- **Files:** `app/**/__tests__/*.test.tsx`, shared UI test helpers (a mocked
  api-client / auth), config.
- **Acceptance:** the `ui` Vitest project passes in CI; each screen has render +
  interaction + error-path coverage; no test hits a real network or renders a board.
- **Dependencies:** M9-T4, M9-T5, M9-T6, M9-T7.

## M9-T9 · Dashboard rows aligned to the design (follow-up)
- **Goal:** the dashboard row renders the anatomy the mockup shows
  (`design-reference.md` §5 `match-dashboard`, `Iron Grid.dc.html` → `MATCH DASHBOARD`).
  M9-T4 shipped the grouping and countdowns but a row read only its status label and a
  clock — no map, no opponent, no day. This closes that gap.
- **Scope:**
  - **Backend:** `listMatchesForUser` also selects `mapId` and the `day_counter`
    mirror column, and left-joins the **other seat** (`match_players` aliased, +
    `users`) for the opponent's `name` and `factionId`. Read-only, **no migration**,
    still anchored to the caller's membership row. The opponent's **email is not
    selected** — identity on the dashboard is name + insignia only.
  - **UI:** the row shows a map tile, the map name, a state pill (`YOUR TURN` in
    faction-yellow when it is the caller's move, else the status label), the
    `vs <insignia> opponent · Day N · W×H` meta line, a `DEADLINE` /
    `THEIR DEADLINE` readout, and a chevron; the **whole row** is the link. Rows that
    are not the caller's move render muted, per the design's two-tier treatment. The
    header gains the design's count subtitle; the CTA reads **"New match"**.
  - Map dimensions reach the client as an RSC prop from `getGameData().maps` (the
    `MapOption` pattern of M9-T5); `formatMapName` title-cases the map **id** —
    `maps.yaml` has no display-name field and the UI must not invent one.
- **Files:** `app/server/db/queries/matches.ts`, `app/lib/api-client.ts`,
  `app/lib/format.ts`, `app/(app)/dashboard/page.tsx`,
  `app/components/dashboard-list.tsx`, and their tests (PGlite + RTL).
- **Acceptance:** the list endpoint returns `mapId` / `day` / `opponent` and **never**
  the opponent's email, with `opponent: null` while the second seat is unfilled; the
  row renders map name, size, day (hidden pre-activation), opponent name + insignia,
  and marks only the caller's own turn with the `YOUR TURN` pill; faction identity
  stays color **+ insignia** (§27.4); `db:generate` produces no schema change.
- **Dependencies:** M9-T4.

## M9-T10 · Map thumbnails (follow-up)
- **Goal:** you can see the map you are choosing. The create form named a map
  (`spann-island · 15×10`) but showed nothing of it, and M9-T9's dashboard row used a
  placeholder icon where the design shows a map tile (`design-reference.md` §5
  `create-match`, `match-dashboard`).
- **Scope:**
  - **`terrainSwatch`** (`app/lib/render/terrain-swatch.ts`) — one flat color per
    `terrain.yaml` id, with a neutral fallback for ids the palette predates. This is
    **not** the board renderer: the battlefield draws the approved art pack through
    the atlas (ADR-0005); a thumbnail needs a color per cell so it reads small, in
    the DOM, with no asset load. `terrain.yaml` has no color field (it is rules data),
    so the palette lives in the client.
  - **`MapThumbnail`** (`app/components/map-thumbnail.tsx`) — `logical_terrain` as a
    CSS grid, one `<span>` per cell, aspect-ratio-correct. A single `role="img"`
    labelled with the map name + size, so hundreds of cells never reach assistive
    tech as noise. Ownership is **not** drawn — `logical_terrain` carries none and a
    thumbnail must not imply a side.
  - **Create form:** the preview follows the `mapId` select. **Dashboard:** the row
    tile is the thumbnail, falling back to the icon for a map the catalogue no longer
    has.
  - `MapOption` / the dashboard's `MapPreviews` gain `width` / `height` / `terrain`,
    carried as RSC props from `getGameData()` — the client cannot `loadGameData`.
- **Files:** `app/lib/render/terrain-swatch.ts`, `app/components/map-thumbnail.tsx`,
  `app/components/create-match-form.tsx`, `app/components/dashboard-list.tsx`,
  `app/(app)/matches/new/page.tsx`, `app/(app)/dashboard/page.tsx`, tests (RTL).
- **Acceptance:** the create form previews the default map and repaints on selection;
  the dashboard row draws its map; the thumbnail exposes exactly one labelled `img`
  with one cell per tile in row-major order; an unknown terrain id still draws.
- **Dependencies:** M9-T5, M9-T9.

**Ordering:** M9-T1 → M9-T2 → M9-T3 → (M9-T4 ∥ M9-T5 ∥ M9-T6 ∥ M9-T7) → M9-T8 →
M9-T9 → M9-T10.

---

# 5. Definition of Done for M9

M9 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` (including the new
   `ui` project) and `pnpm build` are green; `pnpm db:generate` produces **no** schema
   change (M9 adds only a read endpoint).
2. A player can **sign in** (magic-link), and unauthenticated access to a gated route
   redirects to sign-in; `signOut` clears the session (`frontend.md` §2).
3. The **dashboard** lists the caller's matches (membership-scoped `GET /api/matches`)
   grouped "your turn" / "waiting" with **deadline countdowns** and an empty-state CTA,
   each row carrying the designed anatomy — map, opponent + insignia, day, deadline
   (M9-T9).
4. **Create** posts the exact create body with **fog forced off**, and surfaces the
   returned invitation code; **join** advances to commander selection; **commander
   select** shows **placeholder** labels (no invented names, §33.1) and reflects
   uniqueness + the `ready_check` transition from the server; **ready** reflects
   `active` (`game-specification.md` §3).
5. **Match completed** renders the winner + reason from the read model
   (`game-specification.md` §23); the **account / notifications** screen round-trips the
   five preference keys via `GET/PATCH /api/me/notifications` (`§26.2`).
6. The UI is **branded** per `design-reference.md` §4 (Manrope/JetBrains, dark-default,
   shadcn/lucide), **faction identity is color + insignia** (never color alone), and it
   is **keyboard-accessible** and honors `prefers-reduced-motion` (`frontend.md` §10).
7. The client is a **thin view over server-authoritative HTTP** (typed api-client,
   cookie session, refetch-to-reconcile) with **no client-side game logic** and **no
   Phaser / board** (`frontend.md` §9). Scope stays inside the shell + lifecycle
   screens: **no** battlefield rendering (M10), **no** replay (M11), **no**
   day-limit score UI (§33.2).

---

# 6. Deferred design gates & scope boundaries (not in M9)

- **The battlefield** — the Phaser `<canvas>`, projected-view rendering, HUD, the
  interaction/preview loop and resolved-event animation are **M10** (`roadmap.md` §5;
  `frontend.md` §3–§7). M9 renders no board; `POST /api/matches/:id/actions` and
  `GET …/events` are **not** consumed by M9.
- **Opponent-turn replay** — fog-filtered per-player playback is **M11**
  (`frontend.md` §8).
- **Commander names & art (§33.1)** — placeholder labels only; the real-name/art swap
  is a gated follow-up. **Property/terrain art (§33.3/§33.4)** and **sprite-row mapping
  (§9.5)** gate M10, not M9.
- **Fog of war** — still blocked at create (M7 guard); the create form must not offer an
  enabled path.
- **Day-limit score display (§33.2)** — the create form accepts `dayLimit`, but score
  UI is §23.4/§33.2-gated to M12.
- **Commander pick-ordering** — strict server-random first/second ordering stays
  deferred (needs an M4 schema pick-order column); M9 rides the any-order backend.
- **Live end-to-end acceptance** — real-server + DB E2E (and the deploy on Vercel +
  Neon) is **M12**; M9 verifies screens against a mocked API in the `ui` project.

---

# 7. Cross-references

- `roadmap.md` — §2 (build order `game-data→game-engine→backend→frontend`), §5 (M9
  lines 172–176; M10 178–186; M11 187–189; Phase-3 header), §6 (blocker map — §33.1
  placeholder commanders), §7 (M9 needs the M6 lifecycle API; M10 needs M7/previews),
  §12 (deploy = Vercel + Neon, M12).
- `frontend.md` — §1 (responsibilities/boundaries), §2 (runtime/framework: App Router,
  shadcn/lucide/react-hook-form+Zod, DOM-only, HTTP-only client), §3 (React/Phaser
  split — board is M10), §9 (state sync: `expectedStateVersion`/`idempotencyKey`,
  refetch-to-reconcile), §10 (accessibility: desktop-first, no color-only identity,
  reduced-motion), §11 (cross-refs).
- `architecture.md` — §2 (server-authoritative), §4 (layer/package layout — `app/` may
  import the stack; engine/data may not import it), §10 (tech mapping; Phaser to add).
- `design-reference.md` — §3 (DOM-only, board = Phaser stand-in), §4 (design system:
  Manrope/JetBrains Mono, shadcn/lucide, faction insignia, `G`/HP/countdowns), §5
  (screen inventory + `docs/05-design/screenshots/`), §7 (assets abstracted, §33 open,
  reduced-motion correction).
- `game-specification.md` — §3 (lifecycle states/creation/invitation/commander/ready),
  §22.3/§33.1 (commanders blocked), §23 (victory reasons), §26.2 (notification
  preferences), §27 (UI/interaction/accessibility), §34 (Functional DoD).
- `decisions/0001-frontend-ui-and-tooling-stack.md` — shadcn/ui, lucide-react,
  react-hook-form + Zod, Vitest.
- `rules.yaml` → `match_lifecycle.creation.allowed_configuration` (`map_id`,
  `fog_enabled`, `turn_deadline_option`, `day_limit`), `commander_rules`,
  `notifications.default_preferences`, `security_rules` (rate limits).
- `coding-standards.md` §9 (forms reuse the validation-boundary shapes), §11–§12
  (`tsc`/`next build`, `pnpm lint`, `cspell` exit bar); `testing.md` (test layers).
- **Landed code composed:** `app/server/auth` (`auth`/`signIn`/`signOut`,
  `requireUser`, session `user.id`); the M6 lifecycle handlers
  (`create`/`join`/`commander`/`ready`/`cancel`); `app/server/actions/read.ts`
  (`MatchView`, `handleGetMatch`); `app/server/account/notifications-endpoint.ts`; the
  routes under `app/api/matches/*` and `app/api/me/notifications`.
