# Crossfire Basin — balance rationale (M10-T10)

**Map:** `official_maps.crossfire-basin` · 20×16 · `status: review`
**Balance status:** `pending_review` — candidate + evidence produced by
implementation; the formal **two-human balance sign-off**
(`maps.yaml` `official_map_release_gates`) is recorded by the project owner. This
document is that evidence, not the approval.

## Fairness by construction

The map is **180° rotationally symmetric**: tile `(x, y)` maps to `(19−x, 15−y)`,
and every terrain feature, property and starting unit is placed as a mirror pair.
Because the first player is selected at random (`game-specification.md` §7.2) and
the two halves are identical under rotation, **no positional advantage can accrue
to either start** — any line available to player 1 has an exact mirror available
to player 2. This satisfies `game-specification.md` §7.2 (balanced for either
starting player) structurally rather than by play-testing.

## Resource & position parity

- **Headquarters:** one each — `hq_p1` at (2, 13), `hq_p2` at (17, 2).
- **Bases (production):** one each — `base_p1` (5, 13), `base_p2` (14, 2).
- **Owned cities:** two each — mirror pairs at (2, 10)/(17, 5) and (6, 13)/(13, 2).
- **Neutral cities:** six, in three symmetric pairs — (9, 3)/(10, 12), (4, 7)/(15, 8),
  (9, 11)/(10, 4) — equidistant from each HQ under the rotation.
- **Starting units:** one infantry + one tank each, mirror-placed near the HQ.
- **Terrain:** only confirmed types (plain, forest, mountain, road); a central
  road seam and symmetric forest/mountain clusters give both sides identical
  cover and choke geometry. No special terrain (§33.3), no sea/air/naval.

## Scripted openings

Ten openings per start position. Player 2's openings are the 180° mirror of
player 1's, so listing player 1's set defines both.

**Player 1 (HQ at 2,13):**

1. Infantry → capture the nearest neutral city (4, 7); tank holds the base lane.
2. Tank → contest the central road seam (9, 7); infantry captures (4, 7).
3. Infantry → toward (9, 11) neutral; tank screens the HQ approach.
4. Build infantry from `base_p1`; existing infantry captures (4, 7).
5. Build recon from `base_p1`; tank pushes the forest at (5, 9) for cover.
6. Tank → flank via the west edge column toward (9, 11); infantry captures (2, 10)-adjacent.
7. Double-capture: infantry to (4, 7), a built infantry to (9, 11).
8. Defensive: tank to the mountain (4, 11) for defense stars; infantry captures (4, 7).
9. Economy-first: capture two owned-adjacent cities, delay the center.
10. Rush the center road seam with tank + built recon, contesting (9, 7)/(10, 8) early.

**Player 2 (HQ at 17,2):** the mirror of each of the above under `(19−x, 15−y)`.

## Reviewer checklist (for the owner's sign-off)

- [ ] Symmetry verified (author-enforced by construction; not machine-checked by
      `validateIntegrity`, though the M10-T10 tests assert it — see below).
- [ ] No terrain/property/unit references unresolved (enforced by `validateIntegrity`).
- [ ] Opening variety adequate for both starts (the ten above + mirrors).
- [ ] Two human reviewers approve balance → then flip `status: published` and
      `balance.status: approved`.

@see docs/04-development/milestones/m10-battlefield.md (M10-T10)
@see docs/02-data/maps.yaml
