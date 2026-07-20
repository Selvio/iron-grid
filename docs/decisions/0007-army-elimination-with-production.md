# 0007 — Army elimination when production remains

**Status:** Accepted
**Date:** 2026-07-20
**Resolves blocker:** `rules.yaml` → `blockers.army-elimination-edge-case`
(`final_elimination_rule`), i.e. the `army_elimination.unresolved_edge_case`
note and `game-specification.md` §23.2's "final AW2-compatible rule".
**Deciders:** Selvio Perez (project owner)

## Context

`rules.yaml` recorded the open question as:

> Exact AW2 behavior for a player with zero units but available production
> remains an explicit verification item. Implementation must follow the approved
> test outcome rather than infer.

The engine meanwhile shipped the literal reading — `victory.ts` treated *"owns no
unit"* as defeated:

```ts
const defeated = (p) => !hasUnits(p.playerId) || (hqsExist && !ownsHeadquarters(p.playerId));
```

That is not a dormant edge case. **It made two of the three maps unplayable**, and
it was found in a real match (`80221a70`, 2026-07-20), whose entire event log is
five entries:

```
1 match_started
2 income_granted   → green
3 turn_started     → green
4 unit_produced    → green builds one infantry
5 match_completed  → "army_eliminated", winner green
```

`rainy-haven` and `eon-springs` both declare `starting_units: []` — by design,
both sides open with **no units at all** and build from their bases. At
activation both players therefore counted as defeated, which the
`survivors.length !== 1` guard silently masked. The moment the first player
produced anything, they became the unique survivor and the match ended on Day 1.
The opponent had not lost an army; they had never had one.

Only `spann-island` ships units placed on the map, which is why the defect had gone
unnoticed.

## Decision

**A player is eliminated only when they have no units *and* no property that can
build one.** Owning a base, airport or port (`properties.yaml` →
`production.category !== "none"`) means the player is *between armies*, not out of
the match.

```ts
const defeated = (p) =>
  (!hasUnits(p.playerId) && !canProduce(p.playerId)) ||
  (hqsExist && !ownsHeadquarters(p.playerId));
```

Note the headquarters does **not** count as production: `properties.yaml` gives it
`production.category: "none"`. A player reduced to an HQ and cities alone is still
eliminated — they have income but no way back onto the board.

Nothing else changes. HQ capture (§13.5, §23.1) is untouched; so is the §23.2
timing rule (evaluation still runs only on resolved end-of-action / start-of-turn
state) and the §23.5 no-auto-draw rule.

## Consequences

- A zero-unit opening is no longer a loss, so `rainy-haven` and `eon-springs`
  become playable and matches are no longer decided by who builds first.
- Losing your last unit next to your own base no longer ends the match. This is
  the substantive gameplay change: a comeback from zero units is now possible for
  as long as you hold a producing property, which raises the value of denying
  bases and lowers the value of a single decisive wipe.
- A stalemate is possible in principle — two players with bases and no funds —
  but the turn-deadline claim (§23, M8) already terminates abandoned matches, and
  income accrues every turn, so it is not reachable in practice.
- Covered by tests in `packages/game-engine/src/victory.test.ts` ("army
  elimination with production available"), including the exact zero-unit opening
  above and the still-eliminated case of an HQ-and-city player.

## Alternatives considered

- **Give the two maps starting units instead.** Smaller, and infers no rule — but
  it leaves the defect latent: losing your last unit beside your own base would
  still end the match instantly. It also silently changes two maps whose balance
  is `pending_review` for a reason unrelated to this bug.
- **Track "has ever fielded a unit" per player.** Fixes the opening specifically,
  but adds state to the snapshot for a case the production rule already covers,
  and still ends a match when a player is wiped while holding a base.
