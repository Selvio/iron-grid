# Iron Grid — M10 · Battlefield (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Frontend / engine / QA / AI contributors

> This is the **execution-detail** breakdown of milestone **M10** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place is
> `roadmap.md` §5 (lines 178–186) and its Phase-3 header; the render/interaction
> contract is `frontend.md` §3–§7, §9, §10 (the React/Phaser split, the selection
> loop, in-browser previews, the animation contract, state sync, accessibility);
> the asset contract is `assets-inventory.md` and `game-specification.md` §7.4,
> §9.3–§9.5, §28; the interaction/combat rules are `game-specification.md` §10,
> §11, §12; the map contract is `maps.yaml` and `game-specification.md` §7. It
> **composes the landed M7 server** (the action pipeline, `POST /api/matches/:id/
> actions`, `GET …/events`, the fog-projected `GET /api/matches/:id` `MatchView`),
> the **pure engine previews** (`calculateMovementRange` / `calculateLegalActions`
> / `calculateCombatPreview`), and the **M9 shell** (the `(app)` gated routes,
> `app/lib/api-client.ts`, `app/lib/session.ts`, `FactionBadge`, the `ui` Vitest
> project). The exit gate is `game-specification.md` §34 (the battlefield slice of
> the Functional Definition of Done) and `coding-standards.md` §11–§12.

---

# 1. Purpose

M10 delivers the **battlefield** — the second half of Phase 3. On the M9 shell it
adds the in-match experience: a **Phaser render of the fog-projected view** inside a
React client component, a **React-DOM HUD**, the full **interaction loop**
(`select → range → destination → preview → confirm → submit → animate → refresh`),
**in-browser non-authoritative previews** that reuse the pure engine, and
**animation of resolved events** — all consuming the action pipeline M7 already
ships (`roadmap.md` §5; `frontend.md` §3–§7).

Two owner decisions shape this milestone and are recorded here:

- **Real art now.** The §9.5 sprite-row mapping is already data-backed
  (`units.yaml rendering.sprite_row`/`row_id`, `game-specification.md` §9.5,
  `assets-inventory.md` §6) and the `game-assets/` pack (Aleksandr Makarov /
  @IKnowKingRabbit — attribution required, `game-assets/license.txt`) matches the
  spec dimensions exactly. M10 **records the §9.5 visual-approval** it was awaiting
  (M10-T1 ADR) and renders the **real** sprite sheets for the 19 units and the 7
  **confirmed** terrains, plus fog and shadows. Property tiles and their ownership
  state render from the pack's building tiles under a **programmatic ownership +
  capture-progress overlay** whose treatment is recorded in the §33.4 ADR (M10-T9);
  **special terrain** (Reef, Pipe, Pipe Seam, Missile Silo — §33.3) stays deferred
  to M12 and appears on no M10 map.
- **First official map now.** M10 authors the first official **20×16** map into
  `maps.yaml` (M10-T10), using only confirmed terrain and property art, so the
  battlefield renders a real map rather than only a test fixture. The map is
  **mirror-symmetric** (fair for either starting player, `game-specification.md`
  §7.2) with the balance rationale and ≥10 scripted openings per start position
  documented. The **formal two-human balance sign-off** (`maps.yaml`
  `official_map_release_gates`) is a review the owner records — M10 produces the
  candidate and its evidence; it does not fabricate the human approval.

M10 **stops before M11 and M12.** Opponent-turn replay (fog-filtered per-player
playback + Skip + textual summary) is **M11** (`roadmap.md` §5 lines 187–189;
`frontend.md` §8); M10 animates only the viewer's *own* just-submitted action. The
special-terrain art (§33.3), the day-limit **score** UI (§33.2), the 30 acceptance
scenarios, and the deploy are **M12**.

**Current state** (starting point): the finished, verified M9 shell — the `(app)`
gated routes, `app/lib/api-client.ts` (with `getMatch` returning `MatchView |
PreActiveMatchView`, plus `listMatches`/lifecycle/notification methods, but **no
`submitAction` and no `getEvents`**), `app/lib/session.ts`, `FactionBadge`,
formatters, and the `ui` (jsdom) Vitest project. The server is complete: `POST
/api/matches/:id/actions` and `GET …/events` are live and tested but **not yet
consumed by any client**; `GET /api/matches/:id` returns the fog-projected
`MatchView`. The pure engine exports `calculateMovementRange`,
`calculateLegalActions`, `calculateCombatPreview`, `projectStateForPlayer`,
`validateAction` and the `Action`/`Event` types. **Phaser is not installed**
(`architecture.md` §10 "Phaser — to add"). `official_maps: {}` is empty; the engine
runs on the `setup.ts` test fixture map. No battlefield UI exists.

---

# 2. Gates for M10

- **Entry (DoR):** each ticket is specified with goal/scope/files/acceptance; the
  server pipeline and engine previews are landed and verified (M7); the M9 shell +
  `ui` project are in place; the asset pack + the data-backed §9.5 mapping are
  present. **Live §33 handling:** M10 **records** the §9.5 unit/terrain visual
  approval (T1 ADR) and the §33.4 property-art treatment (T9 ADR) — the owner's
  standing decision to render real art — so real unit/terrain/property art is in
  scope. **§33.3 special terrain stays blocked** (no M10 map places it); **§33.2
  score UI** stays out. The official-map **balance sign-off** (two human reviewers)
  is an owner-recorded gate, not an implementation output.
- **Exit (DoD):** the battlefield slice of the Functional Definition of Done
  (`game-specification.md` §34): from a live `GET /api/matches/:id`, the active
  player sees the fog-projected board rendered in Phaser with the real art, selects
  a unit, sees its movement range and a legal-action/combat preview computed
  **in-browser by the pure engine**, confirms (no undo, `§10.4`), submits through
  `POST …/actions` carrying `expectedStateVersion` + `idempotencyKey`, watches the
  returned event animate, and the client **refetches** the projected view; a stale
  submit is a typed conflict that triggers a refetch, never a local re-apply
  (`frontend.md` §9). The first official map renders end-to-end. Plus the
  code-change bar (`coding-standards.md` §11–§12). The **pure** logic (interaction
  state machine, preview wiring, render mapping) is unit-tested in the `ui`/node
  projects; the Phaser canvas itself is verified manually / in M12 acceptance (no
  WebGL in jsdom). The milestone DoD is §5.

---

# 3. Cross-cutting decisions

- **React owns the DOM, Phaser owns the canvas** (`frontend.md` §1 table, §3).
  Phaser renders only the battlefield — tilemap, unit sprites, camera, fog overlay,
  range/path highlights, cursor, resolved-event animation — mounted in a `"use
  client"` component via a `useRef` canvas. React owns the match shell, the HUD
  (funds/day/turn/deadline/selected-unit), the preview readouts and the no-undo
  confirmation, and all accessible status text. **Phaser emits selection/target
  intent; React owns confirmation and submission; animation completion never gates
  gameplay** (`game-specification.md` §28.2).
- **The Phaser scene is a thin imperative shell over pure modules** (the testing
  strategy, `testing.md` §7, §12). All decidable logic lives in framework-free
  units the `ui`/node projects test: (a) the **interaction state machine**
  (`select→range→destination→preview→confirm→submit→animate`) as a pure reducer;
  (b) the **preview wiring** — a `MatchView → engine-state` adapter plus the
  `calculate*` calls; (c) the **render mapping** (`deriveRenderData`: unit →
  `sprite_row` + `animation_columns` frame coords, `logicalTerrain` → `renderTileId`,
  faction → sheet, acted/greyed §10.5, submarine surfaced/submerged §19.5). The
  Phaser `Scene` only consumes those outputs to draw/tween/animate; it holds no game
  logic and is **not** unit-tested against a WebGL context (jsdom has none) — pixel
  rendering is manual / M12.
- **Previews reuse the pure engine, non-authoritatively** (`frontend.md` §6;
  `game-specification.md` §12.7, §27.3). The client imports `calculateMovementRange`
  / `calculateLegalActions` / `calculateCombatPreview` from `game-engine` (the
  dependency direction permits `app → game-engine`; `architecture.md` §4) and runs
  them **against the projected view** so no hidden information leaks; combat preview
  draws no luck (min/max only). Every preview is advisory — the server re-validates
  and the client discards the preview in favor of the returned event on any
  disagreement. **New design task:** the engine `calculate*` functions take a full
  `MatchState`; the client holds only a `MatchView`. M10 builds an explicit
  **projection→engine-state adapter** (T5) — this is not spelled out in the docs and
  is owned here; the adapter must never invent hidden state (unknown enemy
  units/funds stay absent, and previews over incomplete state are treated as
  advisory only).
- **Submit → conflict → refetch, never re-apply** (`frontend.md` §9;
  `game-specification.md` §25.3). Every action submit reads `expectedStateVersion`
  from the current `MatchView.stateVersion` and carries a fresh `idempotencyKey`; a
  stale submit returns the typed 409 conflict with the safe current version, and the
  client **refetches** `GET /api/matches/:id` rather than re-simulating. Multiple
  tabs are allowed. The client is a thin view over server-authoritative state.
- **Real art via recorded approvals; no invented art** (`assets-inventory.md` §9.2;
  `game-specification.md` §28.3; `roadmap.md` §5 JIT rule). The §9.5 unit/terrain
  mapping approval (T1) and the §33.4 property-art treatment (T9) are recorded as
  ADRs and reflected in the data (`units.yaml`/`terrain.yaml`/`properties.yaml`
  `asset_status`). Atlas slicing uses the **stable-ID formulas** (`unit`:
  `frame_x = col*32`, `frame_y = 16 + row*32`; `terrain`: 16px grid) from the data
  geometry. **Missing animations** (capture, supply, repair, load/unload, power,
  missile, production — no frames exist, §28.3) are built from tweens / particles /
  DOM overlays, **never** invented sprite art. Sprite frames are **32×32** while
  terrain tiles are **24×24** (`units.yaml asset_frame` vs `terrain.yaml tile_grid`,
  `frontend.md` §4) — the renderer anchors the larger sprite over the tile
  (bottom-centered, overhanging), a rendering decision fixed here.
- **Special terrain and the score UI stay blocked** (`game-specification.md` §33.3,
  §33.2). No M10 map places Reef/Pipe/Pipe Seam/Missile Silo; the renderer needs no
  tiles for them. The day-limit score surface is not built (the create form's
  `dayLimit` remains data-only).
- **The official map is mirror-symmetric and owner-signed** (`maps.yaml`
  `official_map_release_gates`; `game-specification.md` §7.2). M10 authors a fair-by-
  construction 20×16 map with a balance rationale and ≥10 scripted openings per
  start; the **two-human balance sign-off** is recorded by the owner, and the map
  carries a `status` reflecting that until it is. M10 does not fabricate the review.

---

# 4. Tickets

## M10-T1 · Phaser mount, asset loader & the §9.5 sprite-approval ADR
- **Goal:** a Phaser canvas mounted in the shell, the asset atlases loaded/sliced by
  stable IDs, and the awaited §9.5 unit/terrain mapping approval recorded
  (`roadmap.md` §2 JIT-first-task rule; `assets-inventory.md` §6, §11).
- **Scope:**
  - Install `phaser`; a `"use client"` battlefield component mounts a Phaser `Game`
    in a `useRef` canvas (created client-side only; no SSR).
  - Copy/serve the `game-assets/` sheets as static assets the game loads (bundled
    with the product per the license — attribution added to a credits surface).
  - `deriveRenderData` / atlas-slicing helpers keyed by the stable IDs
    (`unit_r{row}`, `terrain_r{row}_c{col}`, faction sheet, `fog_*`, shadows) from
    `units.yaml`/`terrain.yaml` geometry (32×32 unit frames, 16px header offset,
    16px terrain grid).
  - **ADR** (`decisions/`) recording the §9.5 visual approval for the 19 units + 7
    confirmed terrains; flip the corresponding `asset_status` in `units.yaml`/
    `terrain.yaml` from proposed/confirmed to approved.
- **Files:** `package.json`, `app/(app)/matches/[id]/play/page.tsx` +
  `app/components/battlefield/*`, `app/lib/render/derive-render-data.ts`, an ADR,
  `docs/02-data/units.yaml`/`terrain.yaml`, `public/` (or an asset route), tests.
- **Acceptance:** the mapping/slicing helpers return correct frame coordinates for
  each unit row + confirmed terrain id (unit-tested in node); the scene mounts
  without throwing under the smoke test (no WebGL assertion); attribution is
  present; `pnpm -r typecheck`/`lint`/`spell`/`build` green.
- **Dependencies:** M9 (shell), M7 (read model).

## M10-T2 · Tilemap render from the projection
- **Goal:** render the fog-projected terrain + fog overlay + camera from `MatchView`
  (`frontend.md` §4; `game-specification.md` §7.4).
- **Scope:** draw the terrain render layers (base + transition/structure/decoration
  per `maps.yaml render_layer_schema`) from `MatchView.visibleTiles`, keeping the
  **logical vs render tile** separation (reason about `logicalTerrain`, draw
  `renderTileId`); the fog overlay for non-visible tiles; a camera over the 20×16
  grid at the desktop scale. Runs against the `setup.ts` fixture map.
- **Files:** `app/components/battlefield/*` (a terrain layer), `render/*`, tests.
- **Acceptance:** the terrain-layer builder maps each fixture tile to the correct
  `renderTileId` and fog state (unit-tested); the scene draws without error.
- **Dependencies:** M10-T1.

## M10-T3 · Unit sprites, faction palette & unit states
- **Goal:** place `MatchView.units` with the real sprites, correct faction sheet and
  visual state (`game-specification.md` §9.5, §10.5, §19.5).
- **Scope:** each unit → its `sprite_row` + idle frame via `animation_columns`;
  faction → sheet from `commanders.yaml faction.unit_sprite_sheet` resolved via
  `MatchView.you/opponent.factionId`; shadow by `size_class`; **acted/greyed**
  (§10.5) and **submarine surfaced/submerged** (§19.5) driven by projected fields,
  never inferred; sprite anchored bottom-centered over the 24px tile.
- **Files:** `app/components/battlefield/*` (a unit layer), `render/*`, tests.
- **Acceptance:** `deriveRenderData` returns the right sheet/frame/shadow/state for
  representative units of each faction and state (unit-tested).
- **Dependencies:** M10-T1 (∥ M10-T2).

## M10-T4 · HUD (React DOM)
- **Goal:** the in-match HUD outside the canvas (`frontend.md` §1, §3;
  `game-specification.md` §27.4).
- **Scope:** funds (`G`), day, whose-turn, deadline countdown, and a selected-unit
  panel (HP 0–10, fuel, ammo where projected), rendered as accessible HTML around
  the canvas; faction identity via `FactionBadge` (color + insignia); reduced-motion
  honored. Reuses M9 formatters.
- **Files:** `app/components/battlefield/hud/*`, tests (RTL).
- **Acceptance:** the HUD renders the projected match fields; countdown + faction
  identity + HP scale are correct; keyboard-accessible.
- **Dependencies:** M10-T1.

## M10-T5 · Selection & movement-range preview + the projection adapter
- **Goal:** select a unit and preview its movement range in-browser
  (`frontend.md` §5, §6; `game-specification.md` §10, §17).
- **Scope:** the **`MatchView → engine-state` adapter** (the §3 design task); on
  select, call `calculateMovementRange` and highlight the reachable set; destination
  pick with a path/cost/fuel readout (§10.4). Non-authoritative; no hidden state
  invented.
- **Files:** `app/lib/preview/*` (adapter + range), `app/components/battlefield/*`,
  the interaction state-machine reducer (`app/lib/battlefield/machine.ts`), tests.
- **Acceptance:** the adapter builds an engine-consumable state from a projected
  view; `calculateMovementRange` over it returns the expected reachable tiles for a
  fixture unit; the reducer transitions select→range correctly (unit-tested).
- **Dependencies:** M10-T2, M10-T3.

## M10-T6 · Legal actions, combat preview & confirmation
- **Goal:** preview legal actions + combat and confirm with no undo
  (`game-specification.md` §11, §12.7, §10.4).
- **Scope:** at a destination, `calculateLegalActions` → the action menu;
  `calculateCombatPreview` → min/max damage + counter forecast (no luck drawn); the
  **no-undo** confirmation panel previewing destination / path / movement cost /
  fuel / follow-up actions (§10.4). All in the reducer + React DOM.
- **Files:** `app/lib/preview/*`, `app/components/battlefield/*`, reducer, tests.
- **Acceptance:** legal actions + combat min/max/counter match the engine over a
  fixture combat; the confirm panel shows the required previews; the reducer reaches
  the confirm state and blocks undo (unit-tested).
- **Dependencies:** M10-T5.

## M10-T7 · Submit & reconcile
- **Goal:** submit the confirmed action and reconcile authoritatively
  (`frontend.md` §9; `game-specification.md` §25.3).
- **Scope:** add `apiClient.submitAction` (`POST /api/matches/:id/actions`, carrying
  `expectedStateVersion` from `MatchView.stateVersion` + a fresh `idempotencyKey`)
  and `apiClient.getEvents` (`GET …/events?since=`) — the routes exist, the client
  methods do not; on the typed 409 conflict, **refetch** `GET /api/matches/:id` and
  rebuild the view; wire the reducer end-to-end (select→…→submit→refresh).
- **Files:** `app/lib/api-client.ts`, `app/lib/battlefield/*`, tests.
- **Acceptance:** a submit sends the correct body with version + key; a 409 triggers
  a refetch and no local re-apply; a success advances to the animate/refresh state
  (unit-tested with a mocked client).
- **Dependencies:** M10-T6.

## M10-T8 · Resolved-event animation
- **Goal:** animate the returned event, non-authoritatively (`frontend.md` §7;
  `game-specification.md` §28).
- **Scope:** animate the resolved `Event` payload (final path, luck, damage, HP
  before/after, animation type — §24.5) via Phaser tweens/clips; **missing-animation
  fallbacks** (capture/supply/repair/load-unload/power/missile/production) from
  tweens/particles/overlays (§28.3), no invented art; honor `prefers-reduced-motion`;
  animation completion never gates gameplay (§28.2 — the state is already
  authoritative before the animation plays).
- **Files:** `app/components/battlefield/*` (animation), `render/*`, tests (the
  animation *plan* builder, not the canvas).
- **Acceptance:** the animation-plan builder maps an event to the right clip/tween
  sequence and falls back correctly for frameless events; reduced-motion collapses
  it (unit-tested).
- **Dependencies:** M10-T7.

## M10-T9 · Property rendering & the §33.4 ownership-overlay ADR
- **Goal:** render properties with ownership + capture-progress, under a recorded
  treatment (`game-specification.md` §13, §33.4; `properties.yaml`).
- **Scope:** an **ADR** recording the §33.4 property-art treatment (pack building
  tiles + a **programmatic** ownership tint/flag overlay + a capture-progress UI),
  and flip the relevant `properties.yaml`/`terrain.yaml` `asset_status`; render
  City/Base/Airport/Port/HQ from `MatchView.properties` with the neutral/blue/green/
  red/yellow ownership overlay and the capture-progress indicator. No special
  terrain.
- **Files:** an ADR, `docs/02-data/properties.yaml`/`terrain.yaml`,
  `app/components/battlefield/*` (property layer), `render/*`, tests.
- **Acceptance:** `deriveRenderData` returns the right property tile + ownership
  overlay + capture state for each ownership value (unit-tested); the ADR records the
  treatment.
- **Dependencies:** M10-T3.

## M10-T10 · Author the first official map
- **Goal:** author and render the first official 20×16 map (`maps.yaml`;
  `game-specification.md` §7).
- **Scope:** design a **mirror-symmetric** 20×16 map using **only** confirmed
  terrain + property art (one HQ per player, symmetric starts/properties, no special
  terrain); add it to `maps.yaml official_maps`; update `publication_state`; document
  the **balance rationale** + **≥10 scripted openings per start position**; render it
  end-to-end via `GET /api/matches/:id`. The map carries a `status` reflecting that
  the **two-human balance sign-off** is still the owner's to record — M10 supplies
  the candidate + evidence, not the human approval.
- **Files:** `docs/02-data/maps.yaml`, a balance-rationale doc, the map-loader/
  validation path (`game-data`), tests.
- **Acceptance:** `game-data` loads and validates the map (schema, unique ids, two
  starts, one HQ each, no blocked terrain); the battlefield renders it; the openings
  + balance rationale are documented; the human-signoff status is explicit.
- **Dependencies:** M10-T2, M10-T3, M10-T9.

## M10-T11 · Battlefield acceptance suite
- **Goal:** prove the battlefield slice of the DoD in the `ui`/node projects
  (`game-specification.md` §34; `testing.md` §7).
- **Scope:** the interaction state machine (full select→…→submit→refresh path);
  preview wiring (adapter + `calculate*` non-authority); render mapping (unit/terrain/
  property/fog); submit carries version+key; **conflict → refetch, no re-apply**;
  reduced-motion + keyboard/HUD accessibility. No canvas/WebGL assertions.
- **Files:** `app/**/__tests__/*.test.tsx`, `app/lib/**/__tests__/*`, helpers.
- **Acceptance:** the suite passes in CI; each DoD behavior has a test; no test
  requires a WebGL context.
- **Dependencies:** M10-T7, M10-T8, M10-T9, M10-T10.

**Ordering:** M10-T1 → M10-T2 → M10-T3 → (M10-T4 ∥ M10-T9) → M10-T5 → M10-T6 →
M10-T7 → M10-T8 → M10-T10 → M10-T11.

---

# 5. Definition of Done for M10

M10 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` (incl. the `ui`
   project) and `pnpm build` are green; `pnpm db:generate` reports **no schema
   change** (M10 is render/client + data, no DB change); `game-data` validation
   passes with the new official map.
2. The **fog-projected board renders in Phaser** from a live `GET /api/matches/:id`
   with the **real** unit sprites (correct faction sheet, §9.5 rows), confirmed
   terrain tiles, fog overlay, shadows, and the acted/greyed + submarine states —
   the §9.5 approval recorded by ADR.
3. The active player can **select a unit**, see its **movement range** and a
   **legal-action menu**, computed **in-browser by the pure engine** over the
   projected view (no hidden-state leak), and a **no-undo confirmation** previewing
   the destination and available actions (§10.4). The **combat-preview** path
   (`previewCombat` + the `combat-preview` reducer state + the forecast panel) is
   built and unit-tested but **not wired into the live controller** — see §6: the
   fixture game data carries no weapons/damage tables, so live attack targeting +
   forecast land with combat data in **M12** (the M7 precedent).
4. Confirming a **move** **submits** through `POST …/actions` with
   `expectedStateVersion` + `idempotencyKey`; the client **refetches** the projected
   view, and a **stale submit** is a typed conflict that triggers a refetch, never a
   local re-apply (`frontend.md` §9). The **animation** builder (`buildAnimationPlan`
   + the scene's `playAnimation`) is built and unit-tested; the live
   submit→`getEvents`→plan→`playAnimation` **bridge is not yet wired** (§6): it is
   the M12 manual-canvas layer, and animation never gates gameplay (§28.2), so the
   refetched view is always authoritative.
5. **Properties** render with neutral/faction ownership + capture-progress under the
   recorded §33.4 treatment; the **first official 20×16 map** is authored, validated,
   renders end-to-end, and ships with a balance rationale + ≥10 openings/start, with
   the two-human balance sign-off status explicit.
6. The **HUD** (funds/day/turn/deadline/selected-unit) renders as accessible HTML,
   faction identity in the HUD is color + insignia (`FactionBadge`), and
   reduced-motion is honored by default. On the **canvas**, ownership is conveyed by
   the faction sheet + property tint (color); the per-tile board insignia (§27.4)
   is scoped to the M12 visual pass (§6, ADR-0004).
7. The **pure** logic (state machine, preview wiring + adapter, render mapping,
   animation plan) is unit-tested in the `ui`/node projects; the Phaser canvas is a
   thin shell verified manually. Scope stays inside the battlefield: **no** opponent
   replay (M11), **no** special-terrain art / score UI / acceptance-scenario suite /
   deploy (M12).

---

# 6. Deferred design gates & scope boundaries (not in M10)

- **Opponent-turn replay** — fog-filtered per-player playback + Skip + textual
  summary is **M11** (`frontend.md` §8; `game-specification.md` §24.3).
- **Special terrain art (§33.3)** — Reef, Pipe, Pipe Seam, Missile Silo stay blocked
  and appear on no M10 map; their tiles + gameplay (missile silo) land in M12.
- **Day-limit score UI (§33.2/§23.4)** — not built; `dayLimit` stays data-only.
- **The two-human balance sign-off** — M10 authors a symmetric candidate map + the
  balance evidence; the formal `official_map_release_gates` human review is recorded
  by the owner, not fabricated here.
- **Live combat targeting & submit** — `previewCombat`, the `combat-preview`
  reducer state and the forecast panel are built and unit-tested, but the live path
  (choose a target → forecast → submit an `attack`) is **not wired**: the fixture
  game data has no weapons/damage tables, so a live combat run cannot execute yet.
  It lands with combat data in **M12** — the same deferral M7 recorded for real
  combat through the action pipeline.
- **The live event-fetch → animation bridge** — `buildAnimationPlan` and the scene's
  `playAnimation` are built and unit-tested, but the runtime seam
  (submit → `getEvents` → plan → `playAnimation`) is **not wired**; `BattlefieldView`
  reconciles by refetch only. Wiring it is part of the **M12** manual-canvas layer
  (animation never gates gameplay, §28.2, so the refetch is always authoritative).
- **The Phaser canvas visual verification** — no WebGL in jsdom; pixel-level
  rendering, the provisional `BASE_TERRAIN_TILE`/`PROPERTY_TILE` atlas cells, and the
  per-tile board **ownership insignia** (§27.4; ADR-0004) are verified/authored in
  the **M12** visual pass. M10 tests the pure logic only.
- **The 30 acceptance scenarios, security pass & deploy** — **M12**.
- **Fog-on matches** — still blocked at create (M7 guard); the renderer draws the
  fog overlay from the projection, but no live fog-on match is created until that
  boundary is lifted.

---

# 7. Cross-references

- `roadmap.md` — §2 (build order; JIT first-task rule), §5 (M10 lines 178–186; M9
  172–176; M11 187–189; M12 193–200; Phase-3 header), §6 (blocker map: §9.5/§33.3/
  §33.4 → the M10 real-art swap), §7 (M10 needs the M7 pipeline + engine previews),
  §12 (deploy = Vercel + Neon, M12).
- `frontend.md` — §1 (owner table), §2 (runtime; app may import the stack + Phaser),
  §3 (React/Phaser split), §4 (rendering model — 20×16, renderTileId vs
  logicalTerrain), §5 (interaction loop), §6 (previews/non-authority — shared pure
  functions), §7 (animation), §8 (replay = M11), §9 (state sync/conflict), §10
  (accessibility).
- `game-specification.md` — §7 (map/grid), §7.4 (logical vs render tile), §9.3–§9.5
  (roster + sprite-row mapping), §10 (movement/path/confirmation §10.4), §11 (action
  types), §12 (combat; §12.7 preview), §13 (capture), §19.5 (submarine states), §24.5
  (event determinism), §25.3 (stale conflict), §27 (UI/interaction/accessibility),
  §28 (animation), §33.1–§33.4 (blockers), §34 (Functional DoD).
- `assets-inventory.md` — §3 (geometry), §4 (terrain inventory; §4.7 buildings/§4.8
  pipes/§4.9 reef), §5–§6 (unit rows + mapping), §7 (four factions), §8–§10 (animation
  limits + MVP scope), §11 (stable IDs), §12 (required follow-ups).
- `architecture.md` — §4 (layers/dependency table; app imports engine, engine never
  imports app), §5 (public engine functions), §10 (tech mapping; Phaser to add).
- Data: `units.yaml` (`conventions.animation_columns`/`asset_frame`/
  `faction_sprite_sheets`; per-unit `rendering.sprite_row`/`row_id`), `terrain.yaml`
  (`conventions.tile_grid`; per-terrain `rendering.asset_status`/`official_map_allowed`),
  `maps.yaml` (`render_layer_schema`, `official_map_release_gates`,
  `publication_state`, `official_maps`), `properties.yaml` (ownership states +
  overlays), `commanders.yaml` (`faction_ids`, `unit_sprite_sheet`).
- `testing.md` — §7 (frontend tests = logic/wiring, not pixels), §12 (Phaser wiring
  is a code-phase task). `decisions/0001` (Vitest/`ui` project).
- **Landed code composed:** `app/server/actions/read.ts` (`MatchView`,
  `projectMatchView`), `app/api/matches/[id]/actions/route.ts` + `.../events/route.ts`,
  `app/lib/api-client.ts`, `app/lib/session.ts`, `packages/game-engine/src`
  (`calculateMovementRange`/`calculateLegalActions`/`calculateCombatPreview`/
  `projectStateForPlayer`/`validateAction`, `Action`/`Event` types, `setup.ts`
  fixture), the M9 `FactionBadge`/formatters/`ui` Vitest project, `game-assets/`.
