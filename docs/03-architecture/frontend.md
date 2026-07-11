# Iron Grid — Frontend

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Frontend, engine, QA, AI contributors

> This document describes the client: the Next.js/React application shell, the
> Phaser rendering surface, the selection-and-preview interaction loop, animation,
> and opponent-turn replay playback.
>
> It **references** rather than restates the canonical rules. Interaction and
> rendering rules are canonical in `game-specification.md` §7 (map), §9.5 (sprite
> mapping), §10.4 (confirmation), §12.7 (damage preview), §27 (UI), §28
> (animation), §24.3–§24.4 (replay). The engine contract is canonical in
> `rules.yaml` → `engine_contract`. Entities named here (Unit, Event, PlayerView, …)
> are defined in `domain-model.md`. The request flow is drawn in `architecture.md`
> §7; the server side is in `backend.md`.

---

# 1. Responsibilities and boundaries

The frontend **renders a server-filtered view and collects intent**. It is never
authoritative over game rules (`architecture.md` §2, `game-specification.md`
§27.3, §29).

| Concern | Owner |
|---|---|
| Decide whether an action is legal and what it produces | `game-engine` (server) |
| Render the player-projected view (units, terrain, fog result) | Frontend (Phaser) |
| Collect selection/target intent and submit an `Action` | Frontend (React) |
| Show non-authoritative previews (range, path, damage) | Frontend, from shared/pure-engine functions |
| Animate the already-resolved event | Frontend (Phaser) |
| Hide information | **Nobody on the client** — the server ships only what the player may see (`architecture.md` §9) |

The client receives a `PlayerView` (`domain-model.md`) that has already passed
through `projectStateForPlayer`. It never sees hidden state and therefore cannot
leak it (`game-specification.md` §18.1, §29).

---

# 2. Runtime and framework

- **Next.js App Router** (React 19) is the application shell: routing, pages,
  session UI, match lists, and the account/notification screens.
- **TypeScript** throughout (`project-manifest.md`).
- **Phaser** owns the battlefield canvas only — the grid, sprites, camera and
  animation. It is mounted inside a React component, not the whole app.
- **UI stack** (`decisions/0001-frontend-ui-and-tooling-stack.md`): the React DOM
  is built with **shadcn/ui** components (Radix + Tailwind v4) and **lucide-react**
  icons; forms use **react-hook-form + Zod** via `@hookform/resolvers`. This stack
  is **DOM-only** — it styles the shell, HUD, menus, lobby and forms. The **Phaser
  canvas is never built from DOM components** (§3); shadcn draws the UI *around*
  the board, not the board itself.
- The client calls the backend over HTTP (`backend.md` §3); it never imports
  `game-data` I/O or touches the database.

The frontend lives in `app/` (root) and may import the full stack, but
`game-engine` and `game-data` may **never** import it (`architecture.md` §4).

---

# 3. React / Phaser split

Two clearly separated concerns, bridged by a thin adapter:

```text
┌──────────────────────────────────────────────────────────┐
│  React (DOM)                                              │
│   • match shell, menus, lobby, ready check                │
│   • HUD: funds, day, turn, deadline, selected-unit panel  │
│   • action confirmation + preview readouts                │
│   • accessible status text (outside/over the canvas)      │
└───────────────┬──────────────────────────────────────────┘
                │ view state ↓        user intent ↑
┌───────────────┴──────────────────────────────────────────┐
│  Phaser (canvas)                                          │
│   • tilemap render, unit sprites, camera                  │
│   • range/path highlights, cursor, selection              │
│   • resolved-event animation playback                     │
└──────────────────────────────────────────────────────────┘
```

- **HUD and critical status are HTML**, not canvas-drawn, so they remain
  accessible and are not trapped by the Phaser canvas
  (`game-specification.md` §27.4).
- Phaser receives the current projected view and emits selection/target intent;
  React owns confirmation and submission. Animation completion never gates
  gameplay (§28.2).

---

# 4. Rendering model

The board is a **logical grid**; rendering is a separate concern
(`game-specification.md` §7).

- **Coordinates** are logical cells `(x, y)`, origin top-left, board 20×16
  (§7.1, `domain-model.md` §8). Selection and actions are expressed in logical
  coordinates, never pixels.
- **Tile size:** source tiles are 24×24 px; recommended desktop scale is 2×
  (48×48 displayed), so the board renders at ~960×768 px (§7.2). The camera may
  adapt to the viewport **without changing the logical grid**.
- **Logical terrain vs render tile are distinct** (§7.4). The client renders
  `renderTileId` (and overlays) but reasons about `logicalTerrain`; one logical
  terrain has many edge/transition variants in the asset pack.
- **Sprite mapping** follows `game-specification.md` §9.5 / `assets-inventory.md`
  (Infantry→row 00, Tank→row 09, …). These mappings are **implementation-blocking
  until visual approval is recorded** (§9.5) — do not hardcode alternatives.
- **Unit visual state** (e.g. submarine surfaced/submerged, §19.5; acted/greyed
  units, §10.5) is driven by fields on the projected unit, not inferred locally.

The client never derives terrain, damage, ownership or visibility from raw
assets; those come from the projected view and server-calculated previews.

---

# 5. Interaction and selection flow

The canonical loop is `game-specification.md` §27.2. The client walks it; the
server remains authoritative at every step:

```text
1  select unit
2  show legal movement range        ← calculateMovementRange (preview)
3  select destination
4  show legal actions               ← calculateLegalActions (preview)
5  preview consequences             ← calculateCombatPreview, path, fuel (§10.4)
6  confirm action                   (no undo — §10.4)
7  submit Action + expectedStateVersion + idempotencyKey  → backend (§4/§8)
8  animate the resolved event       ← from the returned/projected Event (§28)
9  refresh filtered state           ← new PlayerView
```

- Steps 1–5 are **non-authoritative previews** for responsiveness only (§27.3).
- Step 6 is explicit: actions commit immediately after server validation and
  there is **no undo** (§10.4).
- The confirmation UI must preview destination, path, movement cost, fuel
  consumption and available follow-up actions before submit (§10.4).

---

# 6. Previews and non-authority

Previews make the UI responsive without ever becoming the source of truth
(`game-specification.md` §27.3, `architecture.md` §9).

- **Shared pure-engine functions.** Preferably the client computes previews by
  calling the *same* pure engine functions the server uses
  (`rules.yaml` → `engine_contract.required_public_functions`:
  `calculateMovementRange`, `calculateLegalActions`, `calculateCombatPreview`).
  Because the engine is framework-independent (`architecture.md` §4), it can run
  in the browser against the projected view.
- **Damage preview** returns a server-calculated expected range — minimum and
  maximum expected damage, and expected counterattack range when applicable
  (§12.7). A preview **must not reveal hidden information** (§12.7): it runs only
  over the projected view, so it structurally cannot.
- **Every preview is re-checked.** The server re-validates and re-applies on
  submit (`backend.md` §4); a preview that disagrees with the authoritative
  result is discarded in favor of the returned event.

---

# 7. Animation contract

Canonical in `game-specification.md` §28.

- **Available frames** per unit sheet: idle, walk side/down/up, attack, hit,
  death (§28.1).
- **Logic separation is absolute:** the authoritative result exists *before* any
  animation begins; animation completion never decides gameplay (§28.2). The
  client animates the resolved `Event` payload (final path, luck, damage, HP
  before/after, animation type — §24.5), it does not simulate.
- **Missing animations** (capture, supply, repair, load/unload, power, missile,
  production) must be built from existing frames, particles, tweening or UI
  overlays (§28.3). **Agents must not invent new art without an asset task**
  (§28.3, `game-specification.md` §33.3–§33.4).
- **Reduced motion:** honor the user's reduced-motion preference by cutting
  nonessential animation (§27.4).

---

# 8. Replay playback

The client plays back events; it never receives the authoritative stream
(`game-specification.md` §24, `backend.md` §6).

- **Opponent-turn replay** (§24.3): when a player opens the match at the start of
  their turn, opponent actions replay automatically, with a **Skip** control;
  after skip or completion the current state is shown, and a textual per-turn
  summary is preserved.
- **Fog-filtered** (§24.4): the client receives **per-player projections** only
  (`player_events`, `database.md` §5.5). The full event stream never reaches the
  browser when fog is enabled — the player sees only events observable at the
  time each occurred.
- **Determinism** (§24.5): events carry enough resolved data (final path, luck,
  damage, HP before/after, animation type, resulting changes) that playback needs
  no recalculation and no RNG.
- **Full-match replay UI is out of MVP scope** (§24.6), but the event data that
  would enable it is preserved server-side.

---

# 9. State sync and concurrency

The client is a thin view over server-authoritative state
(`game-specification.md` §25, `backend.md` §8).

- Every mutation carries `expectedStateVersion` and an `idempotencyKey`
  (`domain-model.md` §11). The client reads the version from the current
  `PlayerView`.
- **Multiple tabs/devices are allowed** (§25.1). A stale submit returns a **typed
  conflict** carrying the current safe `stateVersion` and **no hidden state**
  (§25.3, `backend.md` §8). The client must reconcile by refetching the projected
  view — it must not guess or re-apply locally.
- Reads (`GET /api/matches/:id`, `…/events`) are always membership-checked and
  player-projected (`backend.md` §6); the client renders whatever it is given.

---

# 10. Accessibility and platform

Canonical in `game-specification.md` §27.1, §27.4.

- **Desktop-first** (mouse, keyboard, desktop browser); the architecture must not
  preclude future touch support (§27.1).
- **Do not rely on faction color alone** — pair color with faction insignia or
  patterns (§27.4).
- **Keyboard focus must not be trapped** by the Phaser canvas; critical status
  must exist as accessible HTML outside or over the canvas (§27.4).
- **Reduced-motion** preference reduces nonessential animation (§27.4, §7).

---

# 11. Cross-references

- `architecture.md` — §2 principles, §7 action lifecycle, §9 information security.
- `backend.md` — §3 API surface, §4 pipeline, §6 reads/replay, §8 concurrency.
- `domain-model.md` — Unit, Event, Action, PlayerView, Board entities.
- `rules.yaml` → `engine_contract` — the pure functions used for previews.
- `game-specification.md` — §7 (map/render), §9.5 (sprites), §10.4 (confirmation),
  §12.7 (damage preview), §24.3–§24.4 (replay), §27 (UI), §28 (animation).
- `assets-inventory.md` — sprite sheet and frame inventory.
- `decisions/0001-frontend-ui-and-tooling-stack.md` — shadcn/ui, lucide-react,
  react-hook-form + Zod, Vitest, husky/lint-staged, JSDoc.
- `design-reference.md` (`05-design`) — illustrative UI/UX mockup of the main
  flows and battlefield that realizes this contract (non-authoritative).
