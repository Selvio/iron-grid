# 0004 — Property art: ownership + capture overlay

**Status:** Accepted
**Date:** 2026-07-17
**Resolves blocker:** `game-specification.md` §33.4 (property art — City / Base /
Airport / Port / HQ ownership, neutral and capture-state visuals) for the M10
battlefield and the first official map (M10-T10). Does **not** resolve §33.3
(special terrain — reef, pipe, missile silo), which stays deferred to M12.
**Deciders:** Selvio Perez (project owner)

## Context

`game-specification.md` §33.4 and `maps.yaml` `official_map_release_gates`
require every property to have approved neutral and player-ownership visuals
before it is placed on an official map. `properties.yaml` marks all five property
types `rendering.asset_status: "mapping_required"` and requires
`ownership_overlay_required: true` + `capture_progress_ui_required: true` over the
states `neutral / blue / green / red / yellow`.

The `game-assets/` pack (ADR-0003) supplies building tiles but **does not** ship
four separately-colorized building sets, nor labelled per-type buildings. Rather
than block the battlefield and the first map on bespoke four-faction building art,
this ADR records the treatment that satisfies §33.4 with the art on hand.

## Decision

Render properties as the pack's **building tile plus a programmatic ownership +
capture overlay**, and approve that treatment for the five property types.

- **Ownership** is a programmatic overlay on the base building tile: a faction
  tint (`--faction-*`) plus the faction insignia (`FactionBadge`), and a neutral
  (grey, no tint) treatment when `ownerPlayerId` is null. No bespoke
  per-faction building sheets are required.
- **Capture progress** renders as a UI bar from `capturePointsRemaining`
  (`(20 − remaining) / 20`), satisfying `capture_progress_ui_required`.
- The mapping lives in `app/lib/render/property-map.ts` (`PROPERTY_TILE`,
  `buildPropertyRenderModel`); the exact tileset cells are provisional and
  confirmed visually in M12 (the canvas is manual).
- **Data:** flip `properties.yaml` `rendering.asset_status` for city / base /
  airport / port / headquarters from `mapping_required` to `confirmed`, recording
  that the ownership/capture visuals are approved. This unblocks placing
  properties on the first official map (M10-T10). Special terrain (§33.3) is
  untouched and stays blocked.

## Consequences

Positive:

- Unblocks property rendering and the first official map without inventing
  four-faction building art (`assets-inventory.md` §9.2 — no art invented without
  an asset task; the overlay is programmatic, not new art).
- Ownership and capture read consistently across all property types from one
  overlay path.

Negative / cost:

- The programmatic tint is a stand-in for hand-authored per-faction buildings; a
  future art pass may replace it. The `PROPERTY_TILE` cells are provisional until
  the M12 visual confirmation.
