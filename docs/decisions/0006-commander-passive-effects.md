# 0006 — Commander passive effects

**Status:** Accepted
**Date:** 2026-07-20
**Resolves blocker:** `game-specification.md` §33.1 / §22.6 **in part** — the
*passive effects* only. Commander names, faction display names, portraits, power
effects, power costs and the meter formula (§22.5, §33.5) remain **open**.
**Deciders:** Selvio Perez (project owner)

## Context

`commanders.yaml` ships four commander slots whose every design value is `null`:
`display_name`, `passive.modifiers` (empty, `passive.status: "unresolved"`), the
meter and the power. §22.6 forbids inventing them, so the engine's declarative
resolver (M3-T8, `packages/game-engine/src/commanders.ts`) has been inert plumbing
and the commander-selection screen tells the player the traits are still being
designed. Nothing about a match currently differs by commander.

The **passive** half of that blocker can be resolved independently of the meter and
the power: a passive is pure declarative data over the modifier vocabulary this
file already fixes (`modifier_targets`, `modifier_scopes`, `modifier_operations`),
and the engine already applies `attack` / `defense` / `capture_power` /
`movement_points` / `property_income` / `vision_range` modifiers at their call
sites. The meter formula is a separate blocker. §22.5 read *"the final exact Iron Grid
formula must be locked in `commanders.yaml` and covered by tests before commander
implementation"* — a single gate over the whole commander. This ADR splits that
gate (see Decision §2) and §22.5 is updated in the same change to say **power**
implementation; the meter itself is untouched and still unresolved.

**Design reference.** The passives were designed against a researched, source-
verified reading of the Advance Wars *day-to-day* abilities — as **mechanics only**.
`implementation_constraints` forbids copying Nintendo commander names, portraits or
narrative, and nothing of that kind is reused. The findings that drove the choices:

- The competitive ceiling for an **army-wide** passive — one that applies to every
  unit with no condition — is about **+10 attack / +10 defense**; the community
  calls that "the strongest non-broken day-to-day in the game", and even it is
  paid for with a near-unusable power. A passive scoped to **one class of unit** is
  historically much larger (+20% for a class of direct-fire units, +50% for a
  single unit type), because the scope itself is the limit and the paired class
  penalty is the price.
- Four levers are **degenerate** and are avoided entirely here:
  - **unit-cost discounts** — they compound every production cycle while the paired
    firepower penalty is only a fixed per-attack tax;
  - **capture-rate multipliers** — they accelerate the victory condition itself
    rather than combat, and are worth *more* with damaged infantry, i.e. exactly
    when they are hardest to punish;
  - **luck/dispersion ranges** — stacking them removes the opponent's ability to
    plan trades at all;
  - **attack-range extension** — +1 range promotes a cheap unit into an expensive
    unit's role ("his artillery is about as good as normal rockets").
- Two archetypes are **healthy**: the bonus **gated on terrain or position** (the
  opponent can deny the condition — this is also the direction the series itself
  took when it replaced global auras with bounded CO zones), and the **unit-class
  bonus paired with a class penalty that is actually paid** — the historical
  failure mode is a penalty on a class the map never fields.

## Decision

### 1. The four passives

Values are **additive percentage points** on the base 100 that
`rules.yaml → combat_rules.formula` consumes (`operation: add`), expressed with the
vocabulary already declared in this file. Commander display names stay `null`; each
passive gets its own original name, which is design of the ability, not of a
character.

| Faction | Passive | Strength | Weakness |
|---|---|---|---|
| blue | **Spearhead** | Direct-fire ground **vehicles** +15 attack | Indirect units −15 attack |
| green | **Entrenched** | +1 terrain defense star on forest / mountain / city | −10 defense on plain / road / shoal |
| red | **Barrage** | Indirect units +20 attack | All direct-fire units −10 attack |
| yellow | **Rifle Corps** | `foot` / `mech` units +15 attack | `tires` / `treads` units −10 defense |

Scope membership, resolved against `units.yaml` and `terrain.yaml`:

- Direct ground **vehicles** (blue's bonus): `recon`, `tank`, `anti_air`,
  `medium_tank`, `neotank` — footsoldiers are excluded on purpose, the same
  carve-out the series uses so an infantry commander has an identity left to own.
- All direct (red's penalty): those five plus `infantry`, `mech`,
  `battle_copter`, `fighter`, `bomber`, `cruiser`, `submarine`.
- Indirect: `artillery`, `missiles`, `rockets`, `battleship`.
- Entrenched terrain: `forest`, `mountain`, `city` for the bonus; `plain`, `road`,
  `shoal` for the penalty.

Rationale per commander:

- **blue / red are mirrors.** Both halves are paid on every official map, because
  direct and indirect units are both core; this is the pairing that fails only when
  the penalised class is absent from play. Blue's bonus stops at vehicles: letting
  it cover footsoldiers made blue tie yellow inside yellow's own speciality, which
  the acceptance test caught: with footsoldiers included, the "yellow out-duels
  blue with infantry" case came out an exact tie (72 vs 72 max damage), which is
  what prompted the narrower scope.
- **No passive is army-wide.** Every one is scoped to a unit class or to terrain,
  so none approaches the +10/+10 army-wide ceiling; the class-scoped magnitudes
  (+15 to +20 attack) sit inside the historical range for a scoped bonus, and each
  is paid for by a penalty on a class that is fielded on every official map.
- **green is the only conditional passive.** Its counterplay is explicit and
  available every turn: fight it in the open, or make it move. The penalty applies
  on the tiles an army crosses most. Its bonus is worth roughly +10 defense at full
  HP and less as the unit is damaged, because a terrain star scales with the
  defender's displayed HP (`damage.ts`) — a self-limiting shape a flat modifier
  would not have.
- **yellow deliberately does not touch capture speed.** Its strength is infantry
  *combat*; a capture multiplier is the degenerate version of the same fantasy.

No passive uses unit cost, capture rate, luck or attack range.

### 2. Passive approval is gated separately from commander enablement

`passive.status: "approved"` is what makes a commander's modifiers live. The
commander itself stays `implementation.enabled_in_mvp: false` while its name, meter
and power are unresolved, and `power.cost` stays `null` — `validateActivatePower`
already rejects activation with `power_not_ready`, so no power can fire.

This supersedes the blanket constraint *"Do not enable a commander with null name,
passive, power cost or meter rules"*, which is restated as two independent gates:

- a **passive** may be approved once it has a name, a description and at least one
  structured modifier;
- a **power** may only be activated once its cost and the meter rules are resolved.

The engine's modifier resolver honours the passive gate: it ignores the modifiers of
any commander whose `passive.status` is not `approved`.

### 3. Terrain-scoped modifiers become real

`terrain_ids` was a declared scope the resolver did not implement, and
`terrain_defense_stars` was a declared target nothing consumed. Both are wired:
the attacker's tile scopes `attack`, the defender's tile scopes `defense`, and
`terrain_defense_stars` is added to the defender's terrain stars — with the
existing rule intact that air units receive no terrain stars.

## Consequences

Positive:

- Commander choice becomes a real gameplay decision for the first time, with four
  passives that each carry a strength and a weakness that is actually paid.
- The commander-selection screen shows the real passive instead of a placeholder,
  while honestly continuing to mark the CO power as pending.
- Two long-declared but dead pieces of vocabulary (`terrain_ids` scope,
  `terrain_defense_stars` target) become exercised and tested.

Negative / accepted risks:

- Balance is designed and unit-tested, not play-tested. The numbers are data, and
  revising them is a data change plus its tests, not an engine change.
- Direct/indirect membership is enumerated as `unit_ids` because `modifier_scopes`
  has no `combat_types` entry. **Debt:** adding `combat_types` would keep a future
  unit from silently falling outside a passive. Deliberately out of scope here; the
  cross-file integrity check makes a stale id a hard failure in the meantime.
- **Matches already in flight change behaviour.** `commanders.yaml` declares
  `conventions.active_match_data_version_locked: true` and §31.2 requires that "a
  later balance change must not silently modify active matches" (acceptance
  scenario #30), but that rule is **not enforced today**: `MatchMeta.dataVersion`
  is stamped at `ready` (`app/server/lifecycle/ready.ts`) and never read back — the
  engine always resolves against the currently loaded game data. This ADR is the
  first change with gameplay consequences, so it is the first to expose the gap.
  Any match that is already `active` when it deploys gains these passives
  mid-match. Enforcing §31.2 (pinning a match to the data version it started on)
  stays open for M12; until then, a rebalance is only safe between matches.

Canonical documents updated in the same change:

- `docs/01-specification/game-specification.md` — §22.3 (passive approved), §22.4
  (the example schema now shows the real `modifiers[]` shape and the `status`
  gate), §22.5 (the meter gates the **power**, not the passive), §22.6, §33.1.
- `docs/02-data/commanders.yaml` — the four `passive` blocks, `design_identity`,
  the `passive_statuses` enum, `commander_template.passive`,
  `implementation.blockers`, `implementation_constraints`,
  `required_validation_tests`.
- `docs/02-data/rules.yaml` — `implementation_blockers.commander-data` no longer
  blocks `commander_modifiers` (it still blocks `activate_power` / `power_meter`).
- `docs/04-development/roadmap.md` §6 — the §33.1 row split into resolved
  (passives) and open (names / powers / costs / art).
- `docs/05-design/design-reference.md` §5 — the commander-select row.
- `docs/decisions/README.md` §5 — the ADR index.
- `docs/04-development/milestones/m3-combat-systems-fog.md` (M3-T8) and
  `m6-lifecycle.md` — historical tickets annotated where they still described the
  resolver as inert or the passives as deferred.

## Alternatives considered

- **Resolve all of §33.1 at once** (names, passives, powers, meter). Rejected: the
  meter formula is its own approved blocker requiring deterministic tests, and
  bundling it would force inventing costs to satisfy a validation gate — precisely
  what §36 forbids.
- **Land the passives as approved-but-inert data** (`enabled_in_mvp: false` with the
  resolver ignoring them until the power lands). Rejected: it delivers no gameplay
  and leaves the resolver's implicit behaviour — it reads `passive.modifiers` with
  no status check — as a trap for whoever populates the file next.
- **A Days-of-Ruin-style CO zone** (bonus only within a radius of a purchased,
  killable CO unit). Rejected: it needs a whole gameplay system that no canonical
  document describes, which `commanders.yaml` forbids
  (`no_effect_requires_undocumented_gameplay_system`).
- **An economy passive** (income or repair-cost). Rejected for the first, which is
  the compounding lever the research flags; and the repair variant would need
  `repair_cost` wired in the engine for a much weaker payoff than the terrain gate.
- **A vision/fog passive.** Rejected: fog is rejected by the server today
  (`fogEnabled: true` is refused), so the passive would be inert on arrival.

## Sources

The mechanical reference behind the Context section — day-to-day ability
catalogues with numbers, the between-game trajectory, and the competitive
community's own tiering. Consulted as **mechanics only**: no name, portrait or
narrative is reused, per `commanders.yaml` `implementation_constraints`.

- <https://awbw.fandom.com/wiki/CO> — day-to-day abilities are "permanent and
  active 100% of the time", most often a stat increase *or decrease*; Von Bolt as
  "the strongest non-broken day-to-day in the game" (110%/110%).
- <https://awbw.amarriner.com/co.php> and <https://awbw.amarriner.com/co_tiers.php>
  — per-CO ability data, and the maintained Tier 0–4 list that "provides the basis
  for the banlists" of tournaments and league play.
- <https://strategywiki.org/wiki/Advance_Wars:_Dual_Strike/COs> — per-CO numbers
  for the cost-discount, capture-rate, class-bonus and range-extension archetypes.
- <https://warswiki.org/wiki/Dispersion> — luck/dispersion as a CO lever, and its
  removal in Days of Ruin (flat 10% for everyone).
- <https://warsworldnews.com/dor/aw4-color.pdf> and
  <https://en.wikipedia.org/wiki/Advance_Wars:_Days_of_Ruin> — the CO-Zone
  rollback: bounded radius, purchased and killable carrier, tag powers deleted.

The reading was assembled by a multi-source search with each numeric claim put
through independent adversarial verification; claims that failed verification are
not relied on above.
