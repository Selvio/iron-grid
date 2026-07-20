# Rainy Haven — balance rationale

**Map:** `official_maps.rainy-haven` · 15×15 · `status: review` · `version: 1.0.0`
**Balance status:** `pending_review` — candidate + evidence produced by
transcription; the formal **two-human balance sign-off**
(`maps.yaml` `official_map_release_gates`) is recorded by the project owner. This
document is that evidence, not the approval.

> **This map is the least balanced of the set and should be reviewed hardest.**
> Property counts are not mirrored: Blue holds 10 to Red's 9. See "The
> imbalance" below before play-testing.

## Topology

An archipelago. **No land route joins the two sides** — the sea splits the map
completely, so every crossing is naval or air, and the beaches (`shoal`) that ring
most islands are the tiles a lander can unload onto. Sea is 112 of 225 cells.

| Resource | player_1 (Blue) | player_2 (Red) |
|---|---|---|
| Headquarters | (14, 0) | (0, 14) |
| Base | (13, 0) | (1, 14) |
| Port | (12, 0) | (2, 14) |
| Airport | (14, 2) | (0, 13) |
| Cities | (11,12) (8,14) (9,14) (10,14) (11,14) (12,14) — **6** | (4,1) (5,2) (4,3) (5,4) (6,5) — **5** |
| Starting units | none | none |
| Starting funds | 0 | 0 |

Neutral and contested: bases (6,1) (9,7) (10,12); ports (9,3) (1,6) (8,8) (13,8);
airports (14,6) (5,10); cities (10,2) (0,5) (0,7) (10,8) (14,8) (3,10) (4,11).
The four neutral ports are the map's real prize — they are what lets a side move
ground force at all.

**Terrain:** `sea` 112 · `plain` 47 · `shoal` 25 · `city` 18 · `port` 6 ·
`forest` 6 · `base` 5 · `airport` 4 · `headquarters` 2. All are
`official_map_allowed`.

## The imbalance

Each player's **home corner is exactly mirrored**: HQ, base, port and airport map
onto their counterpart under a 180° rotation (the airport is the one tile off —
Blue's is at (14,2) where the rotation of Red's (0,13) predicts (14,1)).

Their **second holding is not**. Red owns a five-city island in the north-west;
Blue owns a six-city coastal strip along the south. Different shapes, different
counts, no rotational relationship at all — Blue's strip mirrors to open plain,
and Red's island mirrors to open sea.

**Net: Blue starts with one more city, so one more income tick per turn from
turn one, on a map where both sides start with zero units and zero funds.** On a
naval map where the first lander is expensive, a permanent income edge is not
obviously small.

This is the review's first question: **play both seats and decide whether Blue's
extra city is compensated** (by Red's island being more compact and easier to
hold, or by Blue's strip being more exposed), or whether the map needs a
correction before publish. Options if it does not survive review: neutralize
Blue's (11,12), or grant Red a sixth city on the north-west island.

## Deliberate deviation from the reference

The reference draws reefs at **(10,0)**, **(0,1)**, **(1,2)** and **(0,10)**.
`reef` is asset-gated (§33.3, `official_map_allowed: false`), so all four are
transcribed as `sea`.

**Unlike Eon Springs, this matters.** Rainy Haven has six ports, so naval units
are live here and reef cover is real terrain advantage. Three of the four reefs
sit in the north-west, on Red's approach. Restoring them when the terrain is
unblocked is a **balance change**, not a cosmetic one, and should be re-reviewed.

## Open questions for the review

1. **Blue's extra city** (above) — the headline question.
2. **No land route.** Confirm a side cannot be locked out of the map if it loses
   the port race early, and that air alone is not a sufficient answer.
3. **Reefs pending** — the map will play differently once §33.3 unblocks them.
4. **Neutral port distribution.** (1,6) sits deep on Red's side and (13,8) deep on
   Blue's; (9,3) and (8,8) are central. Confirm the two "home" neutral ports are
   equally reachable.

## Provenance

Transcribed tile-for-tile from `maps/Rainy Haven.png` (15×15 at 16px) using
`scripts/atlas/_classify.ts`: terrain from the reference's quantized palette,
building **type** from silhouette clustering (seven distinct silhouettes: city,
base, port, airport, headquarters, plus per-owner variants), building **owner**
from its color ramp. The result was rendered with `scripts/atlas/_board.ts` and
compared against the reference side by side (`scripts/atlas/_sbs.ts`).
