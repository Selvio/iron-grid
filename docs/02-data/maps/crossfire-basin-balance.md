# Crossfire Basin — balance rationale (M10-T10)

**Map:** `official_maps.crossfire-basin` · 15×10 · `status: review` · `version: 2.0.0`
**Balance status:** `pending_review` — candidate + evidence produced by
implementation; the formal **two-human balance sign-off**
(`maps.yaml` `official_map_release_gates`) is recorded by the project owner. This
document is that evidence, not the approval.

## Topology

The map is an **asymmetric island** reconstructed from the visual reference
(central lake/basin, north channel bridge, east bay, SE peninsula). Fairness is
by **resource and opener parity**, not 180° rotational symmetry:

| Resource | player_1 (Blue, NE) | player_2 (Red, SW) |
|---|---|---|
| Headquarters | (12, 1) | (2, 5) |
| Bases (×4) | (11,1) (13,1) (12,2) (13,2) | (1,5) (4,5) (1,6) (2,6) |
| Owned cities | 0 | 1 at (8, 8) |
| Starting units | infantry (10,2) + tank (11,2) | infantry (3,6) + tank (4,6) |
| Starting funds | 0 | 0 |

Nine neutral cities sit on contested land: (1,3) (2,3) (9,2) (9,4) (11,4)
(12,5) (5,8) (12,8) (13,8). The extra Red city at (8,8) offsets Blue’s slightly
shorter HQ↔base cluster; reviewers should confirm that trade in play.

**Terrain (official-map-allowed only):** `sea`, `plain`, `forest`, `mountain`,
`road`, `city`, `base`, `headquarters`. Visual bridges are logical `road` (the
`bridge` terrain remains asset-gated).

## Scripted openings

Ten openings per start. Paths assume fog-off and standard infantry/tank movement.

**Player 1 — Blue HQ (12,1):**

1. Infantry → capture (9, 2); tank screens the north road.
2. Infantry → (11, 4); tank holds the east road spine at (12, 3).
3. Tank → contest the north bridge (6, 1); infantry captures (9, 2).
4. Build infantry from a NE base; existing infantry takes (9, 4).
5. Build recon; tank pushes south along (12, *) toward the peninsula bridge.
6. Infantry → (12, 5); tank covers the mountain line at (10, 3)/(10, 4).
7. Double-capture: infantry to (9, 2), built infantry to (11, 4).
8. Defensive: tank to mountain (10, 3); infantry captures (9, 2).
9. Economy-first: secure (9, 2) and (9, 4) before contesting the basin.
10. Rush the SE peninsula via (12, 6)→(10, 8) for (12, 8)/(13, 8).

**Player 2 — Red HQ (2,5):**

1. Infantry → capture (1, 3); tank screens the west road at (3, 5).
2. Infantry → (2, 3); tank holds (3, 4).
3. Tank → north toward the bridge (4, 1)/(5, 1); infantry takes (1, 3).
4. Build infantry; existing infantry captures (2, 3).
5. Build recon; tank pushes the central basin edge via (4, 4).
6. Infantry → (5, 8); tank covers mountains (4, 8)/(6, 8).
7. Double-capture: infantry to (1, 3), built infantry to (5, 8).
8. Defensive: tank to mountain (4, 8); infantry captures (2, 3).
9. Economy-first: lean on (8, 8) income and take (5, 8) next.
10. Contest the north road/bridge early with tank + built recon.

## Reviewer checklist (for the owner's sign-off)

- [ ] Island silhouette, lake, bay, roads and property colors match the reference.
- [ ] No terrain/property/unit references unresolved (enforced by `validateIntegrity`).
- [ ] Opening variety adequate for both starts (the ten above).
- [ ] Owned-city asymmetry (Red +1) is acceptable or compensated.
- [ ] Two human reviewers approve balance → then flip `status: published` and
      `balance.status: approved`.

@see docs/04-development/milestones/m10-battlefield.md (M10-T10)
@see docs/02-data/maps.yaml
