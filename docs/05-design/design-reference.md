# Iron Grid — Design Reference

**Version:** 1.0
**Status:** Illustrative reference (non-authoritative)
**Audience:** Frontend, product, design, QA, AI contributors

> This document is the **visual/UX reference** for Iron Grid: it points at the
> Claude Design mockup of the main flows and the battlefield, and records what it
> covers, the design system it uses, and how to keep it current.
>
> It is **illustrative, not canonical**. Gameplay behavior is defined in
> `game-specification.md`, the frontend contract in `frontend.md`, and the UI
> library choices in `decisions/0001-frontend-ui-and-tooling-stack.md`. Where the
> mockup and those documents ever disagree, **those documents win** — the mockup
> is a non-authoritative preview, exactly like the client previews it depicts
> (`frontend.md` §6, `architecture.md` §9).

---

# 1. Purpose and scope

This document answers: *what does Iron Grid look like, and where is the source of
that design?*

It covers:

- Where the design lives and how to view/update it.
- Its authority (or deliberate lack of it) relative to the canonical docs.
- The design system: theme, type, components, color/accessibility rules.
- The screens and battlefield interaction states it realizes.
- What is intentionally abstracted or still open.

It does **not** cover:

- Gameplay behavior → `game-specification.md`.
- The frontend architecture and interaction contract → `frontend.md`.
- UI/tooling library decisions → `decisions/0001-frontend-ui-and-tooling-stack.md`.
- Sprite/tile art inventory → `assets-inventory.md`.

---

# 2. Source of the design

The design is a **Claude Design** project, authored from the design brief distilled
from this documentation.

| | |
|---|---|
| Project | **Iron Grid browser game** (owner: Selvio) |
| Project ID | `33bee56f-42ec-40ba-be2c-47be1b910edd` |
| Source file | `Iron Grid.dc.html` |
| Live URL | <https://claude.ai/design/p/33bee56f-42ec-40ba-be2c-47be1b910edd?file=Iron+Grid.dc.html> |
| Local copy | `docs/05-design/Iron Grid.dc.html` (+ `support.js`) — a committed export, kept alongside this doc as a durable reference |
| Rendered previews | `docs/05-design/screenshots/` — committed PNG captures of every screen and battlefield state (named by what they show). These are the static, view-anywhere reference; the exported HTML does not render as a plain page (see below). |

**Viewing / updating:** open the live URL, or read/edit the project
programmatically through the Claude Design MCP (`DesignSync`: `get_project`,
`list_files`, `get_file`). Changes are made by prompting the Claude Design project
(see §7), then re-importing to verify — and re-exporting the local copy so it
stays current.

The exported HTML uses Claude Design's own template syntax (`<x-dc>`, `{{ }}`
bindings) and its runtime (`support.js`, which expects React/ReactDOM globals). It
is a **design artifact, not the production frontend**, and does not render as a
plain static page — the live URL is the canonical rendered view.

---

# 3. Status and authority

- **Non-authoritative.** The mockup never defines a rule. It visualizes the
  behavior defined elsewhere and is subordinate to `game-specification.md` and
  `frontend.md` in the precedence order (`master-index.md` → Document Priority).
- **DOM layer only.** It designs the **React/DOM** surface — shell, HUD, panels,
  menus, dialogs, forms. The **battlefield board is a stand-in** for the Phaser
  `<canvas>`; in production the grid, sprites and animation are rendered by Phaser,
  not by this markup (`frontend.md` §3–§4).
- **Preview semantics preserved.** The mockup correctly shows client actions as
  previews that confirm explicitly with **no undo**, labeled server-resolved —
  matching server authority (`frontend.md` §5–§6, `game-specification.md` §10.4,
  §29).

---

# 4. Design system

| Aspect | Choice |
|---|---|
| Theme | Dark by default, with a light variant; a Tweaks panel toggles Theme / Motion / Annotations. |
| Type | Manrope (UI) + JetBrains Mono (numeric/stat readouts). |
| Components & icons | shadcn/ui-style components with lucide-style icons (`decisions/0001-frontend-ui-and-tooling-stack.md`). The export is a static mockup, not literal shadcn source. |
| Faction identity | Blue / Green / Red / Yellow, **always paired with a distinct insignia** — never color alone (`game-specification.md` §27.4, `frontend.md` §10). |
| Numbers | HP shown 0–10; funds in a generic currency (`G`); deadlines as countdowns. |

The surrounding UI is crisp modern web; the board area reads as a retro pixel grid
(20×16), consistent with `frontend.md` §4.

---

# 5. Screens covered

| Screen | Realizes |
|---|---|
| **Battlefield** (in-match) | `frontend.md` §3–§6; the HUD, selected-unit panel, action menu, previews (§6). Includes navigable interaction states (§6 below). |
| Match dashboard / list | Match lifecycle surfacing — "your turn" vs "waiting for opponent", deadlines (`game-specification.md` §3, §4.3). |
| Create match | Map / fog / turn-timer setup with inline validation (`game-specification.md` §3.2, §18, §4.3). |
| Invitation / join | Invite by code/link; guest joins by code (`game-specification.md` §3.3). |
| Commander selection | Four factions, one commander each. The **passive is real** (ADR-0006) and the card shows it; **names and the CO power are still placeholders** — that half of the commander design remains a blocker (`game-specification.md` §22.3, §22.6, §33.1). The mockup's own PASSIVE / CO POWER copy is illustrative filler, not canon. |
| Ready check | Both players confirm; match starts when both ready (`game-specification.md` §3.5). |
| Opponent-turn replay | Auto-play with **Skip** and a textual per-turn summary (`game-specification.md` §24.3, `frontend.md` §8). |
| Match completed | Winner + reason: HQ captured / army eliminated / timeout / resignation (`game-specification.md` §23). |

**Screenshot index** (`docs/05-design/screenshots/`, named by content):

- Battlefield states — `battlefield-01-idle`, `-02-unit-selected`,
  `-03-action-menu`, `-04-combat-preview`, `-05-post-action`, `-06-fog-of-war`,
  `-07-loaded-transport`, `-08-capturing`.
- Other screens — `match-dashboard`, `create-match`, `invite-join`,
  `commander-select`, `ready-check`, `match-completed`.

(No opponent-replay capture yet; the flow is described in §5 and `frontend.md` §8.)

---

# 6. Battlefield anatomy

The persistent HUD regions (per `frontend.md` §3):

- **Top bar** — day, turn owner, turn-deadline countdown, both players' funds +
  insignia, menu.
- **Selected-unit panel** — sprite, HP (0–10 pips), fuel, ammo, movement type,
  and the terrain defense where the unit stands.
- **Action menu** — contextual actions at the chosen tile.
- **Board overlays** — movement range, attack range, path preview and tile
  tooltips, rendered as DOM over the canvas stand-in.

The mockup exposes the interaction loop of `frontend.md` §5 as eight selectable
states: **idle**, **unit selected** (range + path + move/fuel readout),
**destination / action menu**, **combat preview** (min–max damage + counterattack,
server-resolved, no undo), **post-action** (acted units greyed), **fog of war**
(hidden tiles, forest concealment, submerged submarine), **loaded transport**
(APC carrying cargo — `CARGO 1/2`, cargo identity owner-only, §16), and
**capturing** (infantry capturing a City with capture-progress, §13).

---

# 7. Open items and intentional abstractions

- **Assets are abstracted.** Units/terrain are colored tokens, not the real
  `game-assets/` sprites. This is deliberate: the board is a Phaser stand-in, and
  the **sprite-row mapping is an open blocker** (`game-specification.md` §9.5,
  §33.3–§33.4) — the design must not lock in unapproved art. See
  `assets-inventory.md`.
- **Reduced motion.** The mockup toggles motion via the Tweaks panel; the
  production target additionally honors `prefers-reduced-motion` by default
  (`frontend.md` §10). *(Pending design correction.)*
- **Opponent-turn replay** is described (§5) but not yet captured as a screenshot;
  the flow is specified in `frontend.md` §8.

When these are addressed in the Claude Design project, update §5–§7 here.

---

# 8. Keeping the design in sync

1. Refine the design by prompting the Claude Design project (a distilled,
   documentation-derived brief — the same method that produced it).
2. Re-import via the `DesignSync` MCP and verify against `frontend.md` and
   `game-specification.md`.
3. Update this document (screens, states, open items) so it stays an accurate
   index of the design.
4. If a design choice implies a real product decision (a new UI library, a changed
   flow), record it as an ADR (`decisions/README.md`) and update the affected
   canonical doc — the mockup never becomes the source of truth by itself.

---

# 9. Cross-references

- `frontend.md` — the frontend contract this design realizes (§3–§6, §8, §10).
- `game-specification.md` — §3 (lifecycle), §10.4 (confirmation/no-undo), §13
  (capture), §16 (transport), §22.3/§33.1 (commanders), §23 (victory), §24.3
  (replay), §27 (UI), §29 (security).
- `decisions/0001-frontend-ui-and-tooling-stack.md` — shadcn/ui, lucide, the UI
  stack the design reflects.
- `assets-inventory.md` — the real sprite/tile assets the production board renders.
- `master-index.md` — documentation map and priority (this doc is illustrative,
  non-authoritative).
