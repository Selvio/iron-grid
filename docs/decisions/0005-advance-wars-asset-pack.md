# 0005 — Battlefield art: the Advance Wars pack and a generated sprite atlas

**Status:** Accepted
**Date:** 2026-07-19
**Supersedes:** ADR-0003 (sprite-row mapping approval), ADR-0004 (programmatic
property ownership overlay)
**Deciders:** Selvio Perez (project owner)

## Context

The battlefield shipped on the **Pangea Wars** pack (ADR-0003): a 24 px terrain
atlas and four 32 px unit sheets on a uniform grid. It works, but it is generic
art doing an Advance Wars job:

- No per-faction property art, which is why ADR-0004 had to invent a
  programmatic tint + capture bar instead of drawing ownership.
- Coast, river and road tiles that do not compose as autotiles, so
  `terrain-map.ts` carried our own neighbor heuristics and the board never read
  like the genre it is modeled on.
- No HUD icons, no effects.

A second project (`Peaupote/advance-war`, GPL Java) carries the ripped GBA
Advance Wars art: 3×3 autotile sets per terrain, every property in five
ownership palettes, per-faction unit sheets with directional walk cycles, the
game's own HUD stat icons and explosion/missile effects.

## Decision

**1. Adopt the Advance Wars pack as the battlefield art**, replacing Pangea Wars
wholesale (terrain, properties, units, HUD icons, effects).

**2. Put all sprite geometry behind a generated manifest.** The pack has no
uniform grid — each unit is a differently sized rectangle at an arbitrary
offset — so `pnpm atlas` (`scripts/build-atlas.ts`) produces
`app/lib/render/atlas.generated.ts`, mapping a logical key to
`{ file, x, y, w, h }`. Terrain, buildings, HUD and effect rectangles are
declared (ported from the source project's renderers); unit clips are found by
scanning the sheets' alpha channel for bounding boxes, seeded by a curated table.

Consequences of the seam:

- `units.yaml` stores `rendering.sprite_key` (a family name), never a row index,
  and `terrain.yaml` documents render tiles as atlas keys, not grid coordinates.
- The server's `unitRender` table carries sprite keys; the client resolves
  rectangles locally.
- Swapping the pack again means re-running the build and re-seeding the unit
  table — not editing the renderer.
- `/dev/atlas` renders every entry for visual approval before the renderer
  trusts it. This replaces the "labeled atlas export" follow-up ADR-0003 asked
  for.

**3. Property ownership is art, not a tint** (superseding ADR-0004). The pack
draws city / base / airport / port / HQ in red, blue, green, yellow and neutral,
so `property-map.ts` selects `building_<type>_<color>_<frame>`. The capture
progress bar is kept; the tint and the insignia overlay are gone.

**4. Map units animate movement only.** Advance Wars plays combat in a separate
battle scene, so the map sheets carry idle and directional walks but no attack,
hit or death frames. Per `game-specification.md` §28.3 the client does not invent
art: an attack is a lunge toward the defender plus a flash on the target, and a
kill plays the pack's explosion.

**5. The pack is prototype-only.** The sprites are the intellectual property of
Nintendo and Intelligent Systems. They are placeholders for development and
**must be replaced before anything is deployed publicly**. `game-assets/license.txt`
records the provenance and the restriction; `CREDITS.md` and `/credits` say the
same in the product.

## Alternatives considered

- **Keep Pangea Wars and derive missing art.** Would need four colorized building
  sets and a redrawn coast/river/road autotile set — the bulk of a tile artist's
  job, to end up approximating the pack we already have.
- **Use the new art only as a visual reference.** Preserves the licensing story
  but delivers no visual change now, which was the point of the request.
- **Hand-measure the sprite rectangles.** ~150 rectangles, re-done on every pack
  change, with no way to check coverage. The detector plus `/dev/atlas` does it
  in one pass and shows what it found.

## Known gaps

- **Neotank** has no map sprite in this pack (the ground sheet ends at the medium
  tank); it borrows the medium tank's art. Swap it when real art exists.
- **Air and naval units** only ship an idle clip, so they reuse it for walks —
  `unitFrame` falls back to idle for any clip the pack lacks.
- The unit palettes (dark navy "blue") and the building palettes (bright blue)
  come from different rips and do not match exactly.
