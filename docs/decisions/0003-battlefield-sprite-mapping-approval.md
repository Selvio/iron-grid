# 0003 — Battlefield sprite-row mapping: visual approval

**Status:** Superseded by [ADR-0005](0005-advance-wars-asset-pack.md)
**Date:** 2026-07-17
**Resolves blocker:** `game-specification.md` §9.5 (unit sprite-row mapping —
"implementation-blocking until visual approval is explicitly recorded") for the 19
MVP units and the 7 confirmed terrains. Does **not** resolve §33.3 (special
terrain) or §33.4 (property art), which remain deferred to M12.
**Deciders:** Selvio Perez (project owner)

## Context

`game-specification.md` §9.5 defines the unit→sprite-row mapping and `units.yaml`
encodes it per unit (`rendering.sprite_row` / `row_id`), but §9.5 and
`assets-inventory.md` §5.1 state the mapping stays "implementation-blocking until
visual approval is explicitly recorded." M10 (battlefield) renders real sprites and
therefore needs that approval on record (`roadmap.md` §2 JIT-first-task rule).

The art is now present: `game-assets/` (Aleksandr Makarov / @IKnowKingRabbit,
`game-assets/license.txt` — attribution required, modification and commercial use
permitted, the raw pack may not be hosted publicly except as part of the product).
The faction unit sheets are **896×1328** and the terrain atlas **240×384** —
dimensionally exact against `assets-inventory.md` §3 and the `units.yaml`
(`asset_frame` 32×32, `sprite_sheet` header 16 / row 32 / 28 columns) and
`terrain.yaml` (`tile_grid` 24×24) conventions. No dimensional reconciliation is
needed; the stable-ID slicing formulas apply as written.

## Decision

Record visual approval of the **§9.5 unit sprite-row mapping** for the 19 MVP units
and of rendering the **7 confirmed terrains** with the real `game-assets/` art.
M10 renders these from the real atlases via the stable-ID mapping.

Approved unit rows (`units.yaml rendering.sprite_row`): infantry 0, mech 2, apc 6,
recon 8, artillery 10, tank 12, medium_tank 14, neotank 16, anti_air 17, missiles
19, rockets 21, fighter 25, bomber 26, battle_copter 29, transport_copter 30,
battleship 32, cruiser 33, lander 34, submarine 40 surfaced / 39 submerged.
(Anti-Air 13→17; Missiles 15→19; Rockets 19→21; Tank 9→12 for tracked turret art.)

Approved terrains (`terrain.yaml` `asset_status: confirmed`, `official_map_allowed:
true`): plain, road, river, forest, mountain, sea, shoal.

Scope and boundaries:

- The approval covers unit and confirmed-terrain art only. **Property art (§33.4)**
  is recorded separately in ADR-0004 (M10-T9) under a programmatic ownership +
  capture-progress overlay; **special terrain (§33.3)** — reef, pipe, pipe seam,
  missile silo — stays blocked and appears on no M10 map.
- No data flip is made: units carry no `asset_status`, and the 7 terrains are
  already `confirmed`. This ADR is the record §9.5 asks for; the data already
  reflects the approved state. Terrain's `official_map_allowed === (asset_status
  === "confirmed")` invariant is left intact.
- Attribution to Aleksandr Makarov is shown at `/credits` (and `CREDITS.md`).

## Consequences

Positive:

- Unblocks the M10 real-art render for units + confirmed terrain against the
  data-backed mapping, with no invented art (`assets-inventory.md` §9.2).
- Keeps the §33.3/§33.4 blockers explicit and deferred, so the approval is scoped.

Negative / cost:

- The mapping is now load-bearing: a future asset-pack change must re-confirm the
  rows. Mitigated by `deriveRenderData` reading `sprite_row` from `units.yaml` via
  `game-data` rather than hard-coding names.
