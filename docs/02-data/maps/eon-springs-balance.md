# Eon Springs — balance rationale

**Map:** `official_maps.eon-springs` · 19×17 · `status: review` · `version: 1.0.0`
**Balance status:** `pending_review` — candidate + evidence produced by
transcription; the formal **two-human balance sign-off**
(`maps.yaml` `official_map_release_gates`) is recorded by the project owner. This
document is that evidence, not the approval.

## Topology

A central irregular lake fed by two channels, ringed by a road loop. Player 1
(Blue) holds the east, Player 2 (Red) the west, and each headquarters sits on the
lake shore facing the other across the water. The lake is crossed nowhere: the
four `bridge` tiles span the two feeder channels at the map edges, so every
ground approach runs around the lake, north or south.

| Resource | player_1 (Blue, east) | player_2 (Red, west) |
|---|---|---|
| Headquarters | (10, 10) | (8, 6) |
| Bases (×4) | (14,1) (16,1) (15,9) (17,9) | (1,7) (3,7) (2,15) (4,15) |
| Airports (×3) | (15,2) (17,2) (16,10) | (2,6) (1,14) (3,14) |
| Owned cities (×5) | (9,1) (10,1) (18,5) (17,6) (17,15) | (1,1) (0,10) (1,11) (8,15) (9,15) |
| Starting units | none | none |
| Starting funds | 0 | 0 |

Six neutral cities are contested: (2,1) (0,3) (1,3) (17,13) (18,13) (16,15).
They sit in two clusters of three, one in each player's *rear* — Red's cluster is
in the north-west, Blue's in the south-east — so the early capture race runs away
from the front rather than into it.

**Ownership is exactly mirrored:** 13 properties each (1 HQ, 4 bases, 3 airports,
5 cities), plus 6 neutrals. Income and production capacity are identical at turn
one, and neither side starts with a unit.

**Terrain:** `plain` 97 · `sea` 91 · `road` 50 · `forest` 42 · `city` 16 ·
`base` 8 · `mountain` 7 · `airport` 6 · `bridge` 4 · `headquarters` 2. All are
`official_map_allowed`.

## Symmetry

The map is **`none_balanced`, not `rotational_180`**. Under a 180° rotation:

- Every base, every airport and both headquarters map exactly onto their
  counterpart (14 of 14).
- 12 of 16 cities map exactly. The remaining four are staggered on the opposite
  diagonal: Blue holds (18,5) + (17,6) where the rotation predicts (0,11) +
  (1,10), and Red holds (0,10) + (1,11). **Counts and distance-to-HQ are
  preserved; only the diagonal differs.**
- 66 of 323 terrain cells differ, concentrated in the lake outline and in
  forest/plain placement. The lake is deliberately irregular.

Fairness therefore rests on mirrored property counts and near-mirrored placement,
not on geometric symmetry. **This is the main thing a reviewer should test**: play
both seats and confirm the four staggered cities and the irregular lake do not
favour a side.

## Deliberate deviation from the reference

The reference draws reef clusters at **(6,4)** and **(13,13)**. `reef` is
asset-gated (§33.3, `official_map_allowed: false`), so both are transcribed as
`sea`. The map has **no port**, so no naval unit can be produced here and the lake
is a pure barrier — the reefs are cosmetic in this map. They can be restored
verbatim when the terrain is unblocked.

## Open questions for the review

1. **No starting units and no port.** Both sides open by building from a base.
   Confirm the first-turn build race is not decided by the random first player.
2. **Three airports each on a 19×17 map** is heavy air production. Confirm air
   does not dominate before ground can contest the lake shore.
3. **The staggered city pairs** (above) are the one placement asymmetry.
4. **HQ exposure.** Both headquarters sit on the shore, reachable by the road
   spur that leaves the ring. Confirm neither is materially easier to rush.

## Provenance

Transcribed tile-for-tile from `maps/Eon Springs.png` (19×17 at 16px) using
`scripts/atlas/_classify.ts`: terrain from the reference's quantized palette,
building **type** from silhouette clustering (buildings of one type share a mask
across owner colors), building **owner** from its color ramp. The result was
rendered with `scripts/atlas/_board.ts` and compared against the reference
side by side (`scripts/atlas/_sbs.ts`).
