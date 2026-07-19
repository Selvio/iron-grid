# Iron Grid — Game Specification

**Version:** 1.0  
**Status:** Definitive functional specification baseline  
**Audience:** Product, game design, backend, frontend, QA, Cursor, Claude Code  
**Primary mechanical reference:** *Advance Wars 2: Black Hole Rising*  
**Asset reference:** `assets-inventory.md`

> This document is the single source of truth for Iron Grid gameplay behavior.
>
> It merges the researched Advance Wars 2 rules with the deliberate Iron Grid adaptations required for asynchronous web multiplayer.
>
> Structured numeric data such as unit values, terrain costs, weapon matchups and commander modifiers must ultimately live in versioned YAML files. This document defines the meaning, behavior and constraints of those data.

---

# 1. Product Definition

## 1.1 Game concept

Iron Grid is a browser-based, turn-based tactical strategy game for private asynchronous 1v1 matches.

Its core battlefield systems reproduce the behavior and strategic feel of *Advance Wars 2: Black Hole Rising* as closely as practical while using:

- Original branding
- Original commanders
- Four factions derived from the available blue, green, red and yellow unit palettes
- The Pangea Wars asset pack
- A modern web application shell
- Persistent asynchronous turns
- Server-authoritative validation
- Event-based turn replay
- Email notifications

Iron Grid is not a campaign remake and does not reproduce Nintendo characters, maps, story, dialogue, names, UI or copyrighted art.

## 1.2 Core design rule

Unless this document explicitly defines a difference, the intended mechanic is the researched Advance Wars 2 behavior.

The implementation must not infer rules from later entries such as Dual Strike, Days of Ruin or Advance Wars By Web when those differ from AW2.

## 1.3 MVP mode

The MVP includes only:

- Private matches
- Exactly two human players
- Asynchronous turns
- Official maps
- Desktop-first controls
- Magic-link authentication
- Email notifications
- Four commanders
- One commander per faction
- One passive ability and one power per commander
- Standard AW2 unit roster represented by the tileset
- No AI opponents
- No campaign
- No public matchmaking
- No spectators
- No chat
- No map editor

---

# 2. Sources of Truth and Precedence

## 2.1 Documentation precedence

If documents conflict, use this order:

1. `project-manifest.md`
2. `game-specification.md`
3. Structured game data files
4. Technical architecture documents
5. Source code

The source code is never allowed to silently redefine gameplay.

## 2.2 Research sources

Primary source:

- Official Nintendo Advance Wars 2 instruction manual.[^manual]

Cross-check sources:

- Nintendo’s official Advance Wars 2 guide.[^nintendo-guide]
- Wars Wiki AW2 damage matrix.[^wars-damage]
- AWBW unit chart and terrain chart.[^awbw-units][^awbw-terrain]
- AWBW damage formula documentation, which states that its formula is based on AW2.[^awbw-formula]
- StrategyWiki AW2 unit reference.[^strategy-units]

## 2.3 Data ownership

These values belong in structured data and must not be duplicated in prose:

- Unit cost
- Movement points
- Fuel
- Daily fuel use
- Ammo
- Vision
- Min/max range
- Movement type
- Transport capacity
- Repair category
- Production property
- Terrain defense stars
- Terrain movement costs
- Weapon matchup damage
- Commander modifiers
- Commander power costs
- Map layouts
- Starting units
- Starting funds

---

# 3. Match Lifecycle

## 3.1 Match states

A match must use these domain states:

```text
draft
waiting_for_opponent
commander_selection
ready_check
active
completed
cancelled
```

### `draft`

The host is configuring the match.

### `waiting_for_opponent`

The invitation code exists and no guest has accepted yet.

### `commander_selection`

Both players are present and commander selection is active.

### `ready_check`

Both commanders are selected. Each player must confirm readiness.

### `active`

The battlefield is running and actions are allowed.

### `completed`

A winner and final reason are recorded. No gameplay action is allowed.

### `cancelled`

The match was cancelled before activation.

## 3.2 Match creation

The host selects:

- Official map
- Fog of war on/off
- Turn deadline option
- Day limit when offered by the selected ruleset
- Supported victory conditions

All other gameplay rules are fixed.

## 3.3 Invitation

A match has:

- A private shareable URL
- A six-character alphanumeric code
- No ambiguous characters such as `0`, `O`, `1` or `I`

Only the host and the accepted guest may access gameplay state.

## 3.4 Commander selection

- Each commander is permanently tied to one faction.
- Selecting a commander automatically selects that faction and its unit palette.
- Duplicate commanders and duplicate faction colors are not allowed.
- The system randomly selects which player chooses first.
- The second player sees the first player’s choice and selects from the remaining commanders.

## 3.5 Ready check

The match begins automatically when:

- Both players have valid commanders
- Both players have explicitly marked themselves ready

## 3.6 First turn

The first player is selected randomly after the ready check.

Map balance must not rely on the host always moving first.

---

# 4. Time Model

## 4.1 Turn-based structure

A player completes a full turn before the opponent becomes active.

The player may activate eligible units in any order.

A unit normally acts at most once per owner turn.

## 4.2 Day definition

For a two-player match:

- Day 1 Player A turn
- Day 1 Player B turn
- Day 2 Player A turn
- Day 2 Player B turn

The day counter advances after both players have completed their turn for the current day.

## 4.3 Turn deadline

Supported match options:

- 24 hours
- 3 days
- 7 days
- No deadline

The deadline starts when the active turn begins.

## 4.4 Expired turn behavior

Expiration does not automatically end the turn or the match.

After expiration:

- The inactive opponent gains the right to claim victory.
- The late player may still submit valid actions.
- The first valid action submitted by the late player removes the outstanding claim right for that expired turn.
- Claim Victory must be server-authoritative and atomic.
- If Claim Victory wins the race against a late action, the match completes.
- If a late valid action wins the race, the claim is rejected.

## 4.5 Resignation

A player may resign at any moment after the match becomes active.

Resignation:

- Requires confirmation in the UI
- Is irreversible
- Immediately completes the match
- Awards victory to the opponent

---

# 5. Start-of-Turn Processing

The server must execute start-of-turn effects in one deterministic transaction.

Required order:

1. Confirm active player
2. Advance turn/day counters as required
3. Generate property income
4. Repair and resupply eligible units on owned properties
5. Apply automatic fuel consumption
6. Destroy units that fail required fuel checks
7. Reset per-turn unit action flags
8. Reset or update temporary commander-power state
9. Recalculate visibility
10. Check defeat/victory conditions
11. Set deadline
12. Emit start-of-turn events

No client may independently simulate this sequence as authoritative state.

---

# 6. Funds and Economy

## 6.1 Currency

The internal currency is integer-based.

The final public name may differ, but all engine data uses integer `funds`.

## 6.2 Income

Default AW2 behavior:

- Each owned income-producing property grants 1,000 funds at the start of the owner’s turn.

Properties that produce income:

- City
- Base
- Airport
- Port
- HQ

Missile Silos and ordinary terrain do not produce income unless explicitly configured in structured data.

## 6.3 Starting funds

Each official map defines starting funds.

There is no global player-configurable starting-funds option in the MVP.

## 6.4 Production

A unit may be produced only when:

- The match is active.
- It is the requesting player’s turn.
- The property belongs to that player.
- The property supports the unit’s production category.
- The tile is unoccupied.
- The player has sufficient funds.
- The unit is enabled in the current ruleset.
- Production does not violate any map-specific restriction.

Production categories:

- Base: ground
- Airport: air
- Port: naval

On success:

- Cost is deducted immediately.
- Unit is created at full HP, fuel and ammo.
- Unit is marked as already acted.
- Unit cannot move or act until its owner’s next turn.
- A production event is persisted immediately.

## 6.5 Funds integrity

- Funds never become negative.
- All deductions are atomic.
- Client-submitted costs are ignored.
- Server reads costs from versioned game data.
- Funds may exceed normal UI display thresholds internally.
- Any display cap must not change stored funds.

---

# 7. Map Specification

## 7.1 Logical size

All official MVP maps use a fixed logical size of:

```text
20 columns × 16 rows
```

This is independent of rendering scale.

## 7.2 Tile size

Source terrain tiles are:

```text
24 × 24 px
```

Recommended desktop rendering scale:

```text
2× = 48 × 48 displayed pixels per logical tile
```

The logical board therefore renders at approximately:

```text
960 × 768 px
```

Camera behavior may adapt to viewport size without changing the logical grid.

## 7.3 Map data

Each map defines:

- Stable ID
- Display name
- Width and height
- Logical terrain for every coordinate
- Render tile/overlay references
- Properties and initial owners
- HQ positions
- Starting units
- Starting unit state
- Starting funds
- Player spawn association
- Supported fog setting
- Supported victory conditions
- Balance metadata
- Version

## 7.4 Logical terrain vs render tile

Logical terrain and visual tile IDs must be separate.

Example:

```yaml
logicalTerrain: forest
renderTileId: terrain_r04_c07
```

This is necessary because the asset pack contains multiple edge and transition variants for one logical terrain type.

## 7.5 Map balance requirement

Each official map must be balanced regardless of which player moves first.

Review must compare:

- Distance to neutral properties
- Distance to production properties
- Route quality
- Defensive terrain access
- Naval and air access
- Early capture timing
- HQ exposure
- Starting army value
- Chokepoints
- First-player advantage

A map is not implementation-ready until reviewed with deterministic opening simulations.

---

# 8. Terrain Model

## 8.1 Terrain fields

Every terrain type must define:

```yaml
id:
defenseStars:
movementCosts:
canHideGround:
canHideNaval:
blocksGround:
blocksAir:
blocksNaval:
capturable:
propertyType:
income:
repairCategories:
productionCategories:
visionModifier:
specialBehavior:
```

## 8.2 Core terrain roster

The intended logical terrain roster is:

- Plain
- Road
- Bridge
- River
- Forest
- Mountain
- Sea
- Reef
- Shoal
- Pipe
- Pipe Seam
- City
- Base
- Airport
- Port
- HQ
- Missile Silo
- Used Missile Silo

## 8.3 Asset gating

Based on the asset inventory:

Fully visually supported:

- Plain
- Road
- River
- Forest
- Mountain
- Sea
- Shoal

Supported after approved mapping:

- Bridge
- City
- Base
- Airport
- Port
- HQ

Blocked until mapping or derivative art is approved:

- Reef
- Pipe
- Pipe Seam
- Missile Silo
- Used Missile Silo
- Faction-specific property ownership variants

A blocked terrain may exist in specification and data preparation, but it may not appear in a production map until art approval.

## 8.4 Defense stars

Terrain defense applies to non-air units.

The AW-style rule is:

- Each terrain star contributes defense proportional to the defender’s displayed HP.
- One star at 10 displayed HP contributes ten percentage points.
- One star at 6 displayed HP contributes six percentage points.
- Air units receive zero terrain defense regardless of the tile.[^awbw-formula][^terrain-defense]

Property and terrain defense values belong in `terrain.yaml`.

## 8.5 Movement costs

Movement cost is determined by:

- Unit movement type
- Logical terrain
- Active commander modifiers
- Active power modifiers

A path is valid only if total cost is less than or equal to remaining movement points and fuel.

Movement types required for the AW2 roster:

- Foot
- Mech
- Tires
- Treads
- Air
- Ship
- Transport Ship

Air normally pays one movement point on traversable tiles and cannot cross Pipe barriers.[^awbw-terrain]

Exact movement-cost values belong in `terrain.yaml`.

---

# 9. Unit Model

## 9.1 Unit instance

A unit instance contains:

```yaml
id:
typeId:
ownerPlayerId:
x:
y:
trueHp:
displayHp:
fuel:
ammo:
hasActed:
isCapturing:
captureTargetId:
cargo:
visibilityState:
specialState:
createdTurn:
```

## 9.2 HP representation

Internally, HP must support true health from 1 to 100.

Displayed HP is the ceiling of true HP divided by 10:

```text
displayHp = ceil(trueHp / 10)
```

Examples:

- 100 true HP → 10 displayed HP
- 91 true HP → 10 displayed HP
- 90 true HP → 9 displayed HP
- 1 true HP → 1 displayed HP

Displayed HP affects attack scaling and terrain-defense scaling in AW2-style calculations.[^awbw-formula]

## 9.3 Standard MVP roster

The MVP uses exactly the 19 standard AW2 units represented by the asset pack.

### Ground

- Infantry
- Mech
- Recon
- APC
- Tank
- Medium Tank
- Neotank
- Artillery
- Rockets
- Anti-Air
- Missiles

### Air

- Battle Copter
- Transport Copter
- Fighter
- Bomber

### Naval

- Battleship
- Cruiser
- Lander
- Submarine

All additional sprite rows remain disabled.

## 9.4 Unit stat baseline

The following baseline values are the expected AW2-style values to be encoded in `units.yaml`.[^awbw-units]

| Unit | Cost | Move | Ammo | Fuel | Fuel/turn | Vision | Range | Move type |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Infantry | 1,000 | 3 | 0 | 99 | 0 | 2 | Direct | Foot |
| Mech | 3,000 | 2 | 3 | 70 | 0 | 2 | Direct | Mech |
| Recon | 4,000 | 8 | 0 | 80 | 0 | 5 | Direct | Tires |
| APC | 5,000 | 6 | 0 | 70 | 0 | 1 | None | Treads |
| Artillery | 6,000 | 5 | 9 | 50 | 0 | 1 | 2–3 | Treads |
| Tank | 7,000 | 6 | 9 | 70 | 0 | 3 | Direct | Treads |
| Anti-Air | 8,000 | 6 | 9 | 60 | 0 | 2 | Direct | Treads |
| Battle Copter | 9,000 | 6 | 6 | 99 | 2 | 3 | Direct | Air |
| Missiles | 12,000 | 4 | 6 | 50 | 0 | 5 | 3–5 | Tires |
| Lander | 12,000 | 6 | 0 | 99 | 1 | 1 | None | Transport Ship |
| Rockets | 15,000 | 5 | 6 | 50 | 0 | 1 | 3–5 | Tires |
| Medium Tank | 16,000 | 5 | 8 | 50 | 0 | 1 | Direct | Treads |
| Cruiser | 18,000 | 6 | 9 | 99 | 1 | 3 | Direct | Ship |
| Fighter | 20,000 | 9 | 9 | 99 | 5 | 2 | Direct | Air |
| Submarine | 20,000 | 5 | 6 | 60 | 1 surfaced / 5 submerged | 5 | Direct | Ship |
| Bomber | 22,000 | 7 | 9 | 99 | 5 | 2 | Direct | Air |
| Neotank | 22,000 | 6 | 9 | 99 | 0 | 1 | Direct | Treads |
| Battleship | 28,000 | 5 | 9 | 99 | 1 | 2 | 2–6 | Ship |
| Transport Copter | 5,000 | 6 | 0 | 99 | 2 | 2 | None | Air |

## 9.5 Sprite mapping

The approved proposed mappings from `assets-inventory.md` are:

| Unit | Row |
|---|---:|
| Infantry | 00 |
| Mech | 02 |
| Recon | 08 |
| APC | 06 |
| Tank | 12 |
| Medium Tank | 14 |
| Neotank | 16 |
| Artillery | 10 |
| Rockets | 21 |
| Anti-Air | 17 |
| Missiles | 19 |
| Fighter | 25 |
| Bomber | 26 |
| Battle Copter | 29 |
| Transport Copter | 30 |
| Battleship | 32 |
| Cruiser | 33 |
| Lander | 34 |
| Submarine | 39/40 |

These remain implementation-blocking until visual approval is explicitly recorded.

---

# 10. Movement

## 10.1 Movement action

A movement request includes:

- Unit ID
- Ordered path
- Expected match-state version

The server validates every coordinate in sequence.

## 10.2 Path rules

A valid path must:

- Begin at the unit’s current tile
- Use only orthogonal adjacency
- Never move diagonally
- Stay in map bounds
- Use terrain traversable by the movement type
- Not exceed movement points
- Not exceed available fuel
- Not pass through enemy units
- Respect fog collision behavior
- Not end on another unit unless a legal Join or Load action follows
- Respect Pipe and other impassable barriers

Friendly units may be passed through when the rules permit, but the moving unit cannot end on an occupied friendly tile unless performing Join or Load.

## 10.3 Fuel consumption

Movement consumes one fuel unit per tile traversed, not per movement-point cost.

This distinction must be preserved:

- A Tire unit crossing one forest tile may spend multiple movement points but only one fuel.
- Cancelled movement in normal visibility does not persist.
- Under fog, movement attempts that reveal a hidden collision may consume fuel according to the original game behavior described by the official manual.[^manual]

## 10.4 Action confirmation

Actions are committed immediately after server validation.

There is no undo.

The UI must preview:

- Destination
- Path
- Movement cost
- Fuel consumption
- Available follow-up actions

## 10.5 Unit acted state

A unit becomes acted when it completes an action that ends its activation.

Depending on chosen command, moving without a follow-up may culminate in `Wait`.

---

# 11. Unit Actions

Valid action types include:

```text
move_and_wait
attack
capture
load
unload
join
supply
produce
dive
surface
launch_missile
activate_power
end_turn
resign
claim_victory
```

The exact available actions are computed by the server from the current state.

The client must never independently decide that an action is legal.

---

# 12. Combat

## 12.1 Combat categories

### Direct combat

- Attacker targets an adjacent tile.
- Attacker may normally move before attacking.
- Defender may counterattack if eligible.

### Indirect combat

- Attacker targets within configured min/max range.
- Attacker normally cannot move and fire in the same turn.
- Defender cannot counterattack.

Indirect MVP units:

- Artillery
- Rockets
- Missiles
- Battleship

## 12.2 Weapon selection

A unit can define:

- Primary weapon
- Secondary weapon

Selection order:

1. Use primary if it has ammo and can damage the target category.
2. Otherwise use secondary if it can damage the target.
3. Otherwise the attack is illegal.

Secondary weapons do not consume primary ammo unless specifically configured.

## 12.3 Base damage matrix

Damage is matchup-specific.

The canonical AW2 base matrix must be encoded in `damage-chart.yaml`, using the standard 19-unit roster and preserving primary/secondary distinctions where required.[^wars-damage]

Rules:

- Missing matrix entry means the unit cannot attack that target with that weapon.
- A value of 1 means the matchup is legal and has 1% base damage before modifiers.
- The engine must not use approximate category multipliers in place of the matrix.
- QA must validate the YAML matrix against the referenced AW2 chart.

## 12.4 Damage formula

Iron Grid uses the AW2-style formula described by AWBW:

```text
attackComponent =
    (baseDamage × attackValue / 100)
    + goodLuck
    - badLuck

healthScaledAttack =
    attackComponent × attackerDisplayHp / 10

defenseFactor =
    (200 - (defenseValue + terrainStars × defenderDisplayHp)) / 100

rawDamage =
    healthScaledAttack × defenseFactor
```

Then:

1. Clamp negative damage to zero.
2. Apply the defined AW2-compatible rounding process.
3. Convert the resulting percentage into true HP damage.
4. Clamp combat damage to the defender’s remaining true HP.

AWBW documents two final rounding steps: round upward to the nearest 0.05, then round downward to the nearest integer.[^awbw-formula]

The game engine must expose formula tests for every rounding boundary.

## 12.5 Default modifiers

Baseline:

```text
attackValue = 100
defenseValue = 100
goodLuck = random integer 0–9 inclusive
badLuck = 0
```

Commander passives and powers may alter these values declaratively.

## 12.6 Randomness

Random combat outcomes must be deterministic for replays.

Required approach:

- Server owns match seed.
- Each random-consuming event uses an explicit deterministic sequence index.
- The chosen luck result is persisted in the combat event.
- Replaying an event never rerolls luck.
- Clients never generate authoritative randomness.

## 12.7 Damage preview

Before confirmation, the client may show a server-calculated expected range.

The preview must not reveal hidden information.

For visible combat, return:

- Minimum expected damage
- Maximum expected damage
- Expected counterattack range when applicable

## 12.8 Counterattack

A counterattack occurs only when:

1. The original attack is direct.
2. The defender survives.
3. The defender has a valid weapon against the attacker.
4. The attacker remains in the defender’s direct attack range.
5. The defender has required ammo when primary ammo is needed.

Counterattack damage:

- Uses defender’s post-hit HP
- Uses the same damage formula
- Uses its own deterministic luck roll
- Consumes ammo when applicable

Indirect attacks are never counterattacked.[^awbw-formula]

## 12.9 Destruction

A unit is destroyed when true HP reaches zero.

Destruction:

- Removes it from the board.
- Destroys all cargo.
- Cancels capture progress tied to the unit.
- Emits explicit unit-destroyed and cargo-destroyed events.
- May charge commander meters.
- May trigger victory evaluation.

---

# 13. Capture

## 13.1 Eligible units

Only:

- Infantry
- Mech

may capture in the MVP.

## 13.2 Capturable properties

- City
- Base
- Airport
- Port
- HQ

Missile Silo behavior is separate and does not use property capture unless explicitly configured.

## 13.3 Capture points

Each capturable property starts with:

```text
20 capture points
```

A capture action subtracts the capturing unit’s displayed HP.

Example:

- 10 HP Infantry: 20 → 10
- Next owner turn at 10 HP: 10 → 0, capture completes

## 13.4 Capture continuity

Capture progress remains only while:

- The same unit remains on the property
- The unit is alive
- The unit continues the capture on a later owner turn

Capture resets to 20 when:

- The capturing unit leaves
- The capturing unit is destroyed
- The property changes ownership
- Another incompatible interruption occurs

Taking damage does not automatically reset progress, but reduces the HP contribution of the next capture action.

## 13.5 Completion

On zero or lower capture points:

- Ownership changes immediately.
- Capture points reset to 20.
- Income and repair behavior follow the new owner from the next relevant start-of-turn processing.
- Capturing the enemy HQ immediately awards victory.

---

# 14. Properties, Repair and Resupply

## 14.1 Compatible repair

At start of turn, a unit on an owned compatible property may:

- Restore up to 2 displayed HP
- Refill fuel
- Refill primary ammo

The official manual states that units on secured properties recover 2 HP per turn and can resupply fuel/ammo.[^repair-manual]

## 14.2 Repair categories

- Ground units: City, Base, HQ
- Air units: Airport
- Naval units: Port

Whether ground units repair on every capturable property must be represented explicitly in `properties.yaml`.

## 14.3 Repair cost

Repair cost is proportional to unit production cost:

```text
cost per displayed HP = floor_or_exact(unitCost × 0.10)
```

For normal AW unit costs divisible by 1,000, this is exact.

Example:

```text
20,000 Fighter × 10% × 2 HP = 4,000 funds
```

Repair is limited by available funds.[^repairing]

## 14.4 Partial repair

If funds are insufficient:

- Repair as many whole displayed HP as can be paid.
- Do not allow funds to become negative.
- Fuel and ammo resupply still follows the final approved AW2 rule and must be covered by tests.
- The implementation must not silently grant fractional displayed HP.

## 14.5 Resupply action

APC may resupply adjacent allied units.

Supply restores:

- Fuel to maximum
- Primary ammo to maximum

The action does not repair HP.

Supply is an explicit action and consumes the APC’s activation.

---

# 15. Joining Units

## 15.1 Eligibility

Two units may join when:

- Same owner
- Same unit type
- Destination unit exists
- At least one is damaged or joining is otherwise legal
- Moving unit can legally reach destination
- Neither cargo state creates an illegal combination

## 15.2 Result

- Moving unit is absorbed into destination.
- True HP combines up to 100.
- Fuel combines up to unit maximum.
- Ammo combines up to unit maximum.
- The resulting unit is marked acted.
- Source unit is deleted.
- One Join event records all before/after values.

## 15.3 Excess HP refund

Health beyond full is converted into funds according to AW-style unit value.

The exact refund must be deterministic and based on the unit’s cost and excess true HP.

Required formula:

```text
refund = floor(unitCost × excessTrueHp / 100)
```

The YAML/game-engine test suite must validate this behavior against known examples before release.

---

# 16. Transport

## 16.1 Capacity and cargo

| Transport | Capacity | Allowed cargo |
|---|---:|---|
| APC | 1 | Infantry or Mech |
| Transport Copter | 1 | Infantry or Mech |
| Lander | 2 | Eligible ground units |
| Cruiser | 2 | Battle Copter or Transport Copter |

## 16.2 Loading

Load is legal when:

- Transport and cargo share owner.
- Cargo can move onto transport tile.
- Transport has capacity.
- Cargo type is allowed.
- Cargo is not itself carrying units.
- Both units are in valid states.

After loading:

- Cargo is removed from the board occupancy layer.
- Cargo state persists inside transport.
- Cargo is marked acted.

## 16.3 Unloading

Unload:

- Selects one cargo unit.
- Selects an orthogonally adjacent legal tile.
- Validates terrain compatibility and occupancy.
- Places the cargo unit.
- Marks unloaded unit acted.

A transport may unload multiple carried units in one unload action when the original mechanic permits and distinct legal destination tiles are selected.

## 16.4 Cargo destruction

Destroying a transport destroys all cargo immediately.

The operation is atomic.

## 16.5 Cargo visibility

Enemy players never receive hidden cargo identity unless the rules explicitly reveal it.

Replay filtering must not expose cargo loaded outside the viewer’s visibility.

---

# 17. Fuel and Ammo

## 17.1 Movement fuel

Each traversed tile consumes one fuel.

## 17.2 Daily fuel

Air and naval units consume configured fuel at start of owner turn.

Baseline values are listed in the unit table.

## 17.3 Fuel exhaustion

If an air or naval unit cannot pay required daily fuel:

- It is destroyed during start-of-turn processing.

Ground units at zero fuel:

- Remain alive.
- Cannot move until resupplied.
- May still perform a legal non-movement action if the original rule permits.

## 17.4 Ammo

- Ammo tracks primary weapon shots.
- A primary attack normally consumes one ammo.
- If primary ammo is zero, secondary weapon may be used when valid.
- Units without secondary weapons cannot attack targets requiring the primary weapon.

---

# 18. Fog of War

## 18.1 Information-security rule

Fog is enforced on the server.

The server must never send full hidden state and rely on Phaser to conceal it.

## 18.2 Visibility sources

A player’s visible tiles are determined by:

- Owned units
- Owned properties when applicable
- Terrain modifiers
- Commander modifiers
- Active powers
- Special detection rules

## 18.3 Unit vision

Each unit has a base vision value from `units.yaml`.

Mountains expand Infantry and Mech vision according to the AW2 rule.

The exact bonus belongs in `terrain.yaml` or a special-rule definition.

## 18.4 Hidden terrain

- Ground units in Forest are hidden unless detection conditions are met.
- Naval units in Reef are hidden unless detection conditions are met.
- Air units do not hide in Forest or Reef.
- Adjacent enemy units can reveal units hidden in these terrain types.[^terrain-overview]

## 18.5 Hidden collision

When movement under fog encounters an unseen enemy unit:

- Movement stops according to the original collision rule.
- Only the minimum required information is revealed.
- Fuel consumed by the attempted route follows the original fog behavior.
- The action event delivered to each player is filtered independently.

## 18.6 Visibility timing

Visibility must be recalculated after:

- Unit movement
- Unit destruction
- Load/unload
- Production
- Capture
- Power activation
- Dive/surface
- Start-of-turn changes
- Missile effects
- Any terrain-state change

## 18.7 Private state

For every server response, derive a player-specific view:

```text
authoritative state
        ↓
visibility calculation
        ↓
player-filtered state
```

The client receives only the filtered result.

---

# 19. Submarine

## 19.1 States

A Submarine has:

```text
surfaced
submerged
```

## 19.2 Dive and surface

- Dive or Surface is an explicit action.
- It consumes the unit’s activation.
- State change is persisted immediately.
- Relevant visibility is recalculated.

## 19.3 Fuel

Baseline:

- Surfaced: 1 fuel per turn
- Submerged: 5 fuel per turn[^awbw-units]

## 19.4 Detection

Submerged submarines are hidden except to valid detectors under the AW2 rules.

Cruisers are the primary intended detector/counter.

## 19.5 Sprite state

Rows 39 and 40 represent visual states of one Submarine unit, not separate unit types.

---

# 20. Missile Silo

## 20.1 Asset gate

Missile Silo remains blocked from production maps until intact and used-state art is approved.

## 20.2 Activation

Only Infantry or Mech standing on an unused silo may launch it.

## 20.3 Effect

The player selects a valid target area.

The AW2-style missile:

- Damages units in its area
- Can affect allied and enemy units
- Cannot reduce a unit below 1 displayed HP / minimum surviving true HP
- Does not directly destroy units
- Converts the silo to Used Missile Silo

Exact radius, target shape and damage amount must be encoded in structured rule data and validated against AW2 before implementation.

---

# 21. Pipe and Pipe Seam

## 21.1 Asset gate

Pipe and Pipe Seam are blocked from official maps until approved art exists.

## 21.2 Pipe

- Occupies terrain layer
- Is impassable
- Cannot be attacked unless the tile is a Pipe Seam

## 21.3 Pipe Seam

- Is destructible terrain
- Has HP
- May be targeted by compatible weapons
- Blocks movement while intact
- Changes into traversable terrain when destroyed
- Emits a terrain-destroyed event
- Causes visibility/pathfinding recalculation

Pipe Seam is not modeled as a normal player-owned unit.

---

# 22. Commanders and Factions

## 22.1 Factions

Exactly four:

- Blue
- Green
- Red
- Yellow

Factions are visual only.

They do not intrinsically change:

- Attack
- Defense
- Movement
- Income
- Unit availability

## 22.2 Commander association

Each commander belongs permanently to one faction.

Commander selection determines:

- Unit palette
- Faction identity
- Passive ability
- Power

## 22.3 MVP commander model

Each commander has:

- One passive ability
- One activatable power
- No Super Power
- No tag system
- No skill slots
- No Dual Strike mechanics

## 22.4 Declarative modifier model

Commander data must avoid hardcoded name checks.

Example schema:

```yaml
id:
factionId:
passive:
  attackModifiers:
  defenseModifiers:
  movementModifiers:
  visionModifiers:
  captureModifiers:
  incomeModifiers:
power:
  meterCost:
  duration:
  immediateEffects:
  modifiers:
```

## 22.5 Power meter

Power meter charges from economic battle value.

The final exact Iron Grid formula must be locked in `commanders.yaml` and covered by tests before commander implementation.

## 22.6 Unresolved commander design blocker

The following are not yet defined and must not be invented:

- Commander names
- Commander portraits
- Passive effects
- Power effects
- Meter costs
- Power duration exceptions
- Meter growth after repeated use

Until those are approved, commander implementation is not Definition of Ready.

---

# 23. Victory and Defeat

## 23.1 Standard victory

A player wins when:

- Enemy HQ is captured
- Enemy army is eliminated under the final elimination timing rule
- Opponent resigns
- Claim Victory succeeds
- Day-limit score resolves in their favor

## 23.2 Army elimination

Elimination checks must happen after a complete atomic action or start-of-turn effect.

A temporary zero-unit state must be evaluated according to the final AW2-compatible rule.

This timing requires a dedicated engine test before release.

## 23.3 Day limit

The host may configure a supported day limit.

When reached, calculate combined score.

The conversation established that scoring considers:

- Properties controlled
- Surviving army value
- Damage caused

## 23.4 Unresolved scoring formula blocker

Exact weights and tie-breaking order are not yet approved.

The implementation must not invent them.

Required design fields:

```yaml
propertyScoreWeight:
survivingValueWeight:
damageScoreWeight:
tieBreakOrder:
```

Until approved, day-limit scoring is not Definition of Ready.

## 23.5 Draw

A draw occurs only when:

- The final scoring formula produces a complete tie after all configured tie-breakers, or
- An administrative resolution explicitly sets draw

No automatic draw is caused merely by inactivity.

---

# 24. Replay and Action History

## 24.1 Immediate persistence

Every confirmed action is:

1. Validated
2. Applied
3. Persisted
4. Assigned a sequence number
5. Converted into one or more replay events
6. Followed by victory evaluation
7. Returned as filtered player views

## 24.2 Event types

Minimum event set:

```text
match_started
turn_started
income_granted
unit_repaired
unit_resupplied
fuel_consumed
unit_moved
unit_blocked_by_fog
unit_attacked
unit_counterattacked
unit_damaged
unit_destroyed
cargo_destroyed
capture_started
capture_progressed
property_captured
unit_produced
unit_loaded
unit_unloaded
units_joined
unit_supplied
submarine_dived
submarine_surfaced
missile_launched
terrain_damaged
terrain_destroyed
power_activated
turn_ended
player_resigned
victory_claimed
match_completed
```

## 24.3 Opponent-turn replay

When a player opens the match at the start of their turn:

- Replay opponent actions automatically.
- Allow Skip.
- After Skip or completion, show current state.
- Preserve a textual/event summary by turn.

## 24.4 Fog-filtered replay

A player sees only events they could observe at the time each event occurred.

The server generates per-player replay projections.

Never send the full event stream to the browser when fog is enabled.

## 24.5 Replay determinism

Events must contain enough resolved data to replay without recalculation:

- Final path
- Luck rolls
- Damage values
- HP before/after
- Visibility-safe actor/target references
- Animation type
- Resulting state changes

## 24.6 Full-match replay

Not included in MVP UI.

Architecture must preserve sufficient events to implement it later.

---

# 25. Concurrent Sessions and Versioning

## 25.1 Multiple devices

A player may open the same match in multiple tabs or devices.

## 25.2 Optimistic concurrency

Every action includes:

```text
expectedStateVersion
```

The server:

- Locks or transactionally guards the match
- Verifies active player
- Verifies version
- Applies action
- Increments version
- Rejects stale actions

## 25.3 Stale client response

On stale state:

- Reject with a typed conflict response
- Return current safe state version
- Require client refresh/reconciliation
- Never partially apply action

---

# 26. Notifications

## 26.1 Provider

Resend.

## 26.2 User preferences

Each player can independently enable/disable:

- Match invitation
- Turn started
- Turn reminder
- Turn expired
- Match completed

Defaults:

- Turn started: enabled
- Turn reminder: enabled
- Match completed: enabled

## 26.3 Reminder rule

Reminder timing is calculated from the selected deadline.

The current intended default is when approximately 20% of the allotted turn time remains.

Exact scheduling must be stored as durable jobs or recomputable timestamps.

Notifications never determine gameplay state.

---

# 27. UI and Interaction Rules

## 27.1 Desktop-first

Primary target:

- Mouse
- Keyboard
- Desktop browser

Architecture must not prevent future touch support.

## 27.2 Selection flow

Typical unit interaction:

1. Select unit
2. Show legal movement range
3. Select destination
4. Show legal actions
5. Preview consequences
6. Confirm action
7. Submit to server
8. Animate resolved event
9. Refresh filtered state

## 27.3 No client authority

The client may calculate previews for responsiveness only when those previews are non-authoritative and subsequently checked by the server.

Combat preview should preferably use a server/shared pure-engine function.

## 27.4 Accessibility baseline

- Do not rely on faction color alone.
- Use faction insignia or patterns in addition to color.
- Keyboard focus must not be trapped by the Phaser canvas.
- Critical status must be represented in accessible HTML outside or over the canvas.
- Reduced-motion preference should reduce nonessential animation.

---

# 28. Animation Contract

## 28.1 Asset frames

Unit sheets provide:

- Idle
- Walk side
- Walk down
- Walk up
- Attack
- Hit
- Death

## 28.2 Logic separation

Animation completion never decides gameplay.

The authoritative result exists before animation begins.

## 28.3 Missing animations

The asset pack does not explicitly provide:

- Capture
- Supply
- Repair
- Load/unload
- Power activation
- Missile launch
- Production

These must use:

- Existing frames
- Particles
- Tweening
- UI overlays
- Approved derivative pixel art

Agents must not invent new art without an asset task.

---

# 29. Security and Anti-Cheat

- All actions validated server-side
- Hidden state filtered server-side
- Invitation codes rate-limited
- Match membership checked on every read/write
- Client-provided ownership ignored
- Client-provided damage ignored
- Client-provided funds ignored
- Client-provided luck ignored
- Idempotency keys required for mutation retries
- Completed matches immutable except administrative metadata
- Replay events append-only

---

# 30. Deterministic Engine Contract

The game engine must be a pure TypeScript package independent from:

- Next.js
- React
- Phaser
- PostgreSQL
- Drizzle
- Resend
- Auth.js

Core API shape:

```ts
validateAction(state, action, gameData): ValidationResult

applyAction(state, action, gameData, randomSource): {
  nextState,
  events,
  stateVersion
}

projectStateForPlayer(state, playerId, gameData): PlayerView
```

Same input, data version, seed and action sequence must always produce the same output.

---

# 31. Structured Data Files

Required:

```text
units.yaml
weapons.yaml
damage-chart.yaml
terrain.yaml
properties.yaml
commanders.yaml
maps.yaml
rules.yaml
```

## 31.1 Validation

At build time, validate:

- Schema
- Unique IDs
- Cross-references
- Complete 19×19 damage coverage where legal
- No unknown movement types
- No unknown property categories
- Valid sprite row mapping
- Map dimensions
- Exactly two player starts
- Valid HQ ownership
- No disabled units in starting armies
- No blocked terrain in production maps

## 31.2 Versioning

Each active match stores the game-data version used when it started.

A later balance change must not silently modify active matches.

---

# 32. Explicit MVP Exclusions

Do not implement:

- Campaign
- Story
- AI opponents
- Public lobby
- Ranked matchmaking
- Spectators
- Chat
- Tutorial
- In-game manual
- Weather
- Map editor
- Custom maps
- User-generated content
- Full completed-match replay UI
- Dual commanders
- Super Powers
- Commander skills
- Veterancy
- Dual Strike-exclusive units
- Additional Pangea Wars sprite rows
- Communication Towers
- Black Hole campaign structures
- Dynamic faction bonuses
- Mobile-first interaction

---

# 33. Open Design Blockers

The following must be resolved before affected tasks become implementation-ready:

## 33.1 Commanders

- Names
- Faction names
- Passive effects
- Power effects
- Costs
- Art

## 33.2 Day-limit score

- Exact weights
- Tie breakers
- Score display

## 33.3 Special terrain art

- Reef
- Pipe
- Pipe Seam
- Missile Silo
- Used Missile Silo

## 33.4 Property art

- Exact building mapping
- Ownership display
- Neutral state
- Capture-state display

## 33.5 Edge-case verification

- Exact elimination timing
- Repair with insufficient funds
- Join refund rounding
- Missile Silo radius/damage
- Fog hidden-collision fuel consumption
- CO meter charge formula

These are explicit blockers, not permission for implementation agents to infer behavior.

---

# 34. Functional Definition of Done

A gameplay feature is complete only when:

- Rule is specified here
- Structured data exists
- Schema validation passes
- Pure-engine tests pass
- Server authorization tests pass
- Fog information-leak tests pass where relevant
- Replay event tests pass
- Concurrent-action tests pass
- Phaser renders the authoritative result
- Documentation references remain valid
- No hardcoded unit/terrain/commander names exist in engine logic unless explicitly justified

---

# 35. Acceptance Scenarios

The final engine test suite must include at least:

1. 10 HP Infantry captures neutral City in two uninterrupted turns.
2. Capture resets when Infantry leaves.
3. Damaged Infantry contributes displayed HP to capture.
4. Tank moves through valid Tread path and consumes fuel by tiles.
5. Recon pays Tire movement penalties.
6. Artillery cannot move and fire in same turn.
7. Direct defender counterattacks after surviving.
8. Defender cannot counterattack an indirect attack.
9. Defender cannot counterattack a target it cannot damage.
10. Terrain defense scales with defender displayed HP.
11. Air unit receives no terrain defense.
12. Primary ammo decrements by one.
13. Secondary weapon is selected when primary is unavailable.
14. Unit on compatible property repairs up to 2 HP and pays funds.
15. APC resupplies adjacent ally.
16. Join combines HP/fuel/ammo and refunds excess.
17. Destroyed transport destroys cargo.
18. Loaded cargo is not board-occupying.
19. Submarine daily fuel differs by state.
20. Aircraft is destroyed when it cannot pay daily fuel.
21. Fog hides Forest/Reef units correctly.
22. Replay under fog leaks no hidden movement.
23. Stale state version rejects an action.
24. Two concurrent actions cannot both commit.
25. Timed-out player action and Claim Victory resolve atomically.
26. Produced unit is unable to act on production turn.
27. HQ capture immediately completes match.
28. Resignation immediately completes match.
29. Match replay reproduces exact HP and luck outcomes.
30. Active match remains bound to its starting game-data version.

---

# 36. Final Principle

When a behavior is not explicit:

```text
Do not guess.
Do not copy a later Advance Wars entry.
Do not hardcode a convenient interpretation.
Mark the task blocked and update this specification first.
```

---

# References

[^manual]: Nintendo, *Advance Wars 2: Black Hole Rising* official instruction manual. The manual documents movement, capture, fuel, supply, properties, fog and unit commands.  
<https://www.nintendo.com/eu/media/downloads/games_8/emanuals/game_boy_advance_8/Manual_GameBoyAdvance_AdvanceWars2BlackHoleRising_EN_DE_FR_ES_IT.pdf>

[^nintendo-guide]: Nintendo Ibérica, official *Advance Wars 2* guide.  
<https://www.guiasnintendo.com/1_GAMEBOY_ADVANCE/AdvanceWars2/advancewars2_SP/welcome.html>

[^wars-damage]: Wars Wiki, *Damage/Advance Wars 2 chart*.  
<https://warswiki.org/wiki/Damage/Advance_Wars_2_chart>

[^awbw-units]: Advance Wars By Web, *Unit Chart*.  
<https://awbw.amarriner.com/units.php>

[^awbw-terrain]: Advance Wars By Web Wiki, *Terrain*.  
<https://awbw.fandom.com/wiki/Terrain>

[^awbw-formula]: Advance Wars By Web Wiki, *Damage Formula*. The page states that the formula is based on the formula used in Advance Wars 2 and documents variables, luck, defense and counterattacks.  
<https://awbw.fandom.com/wiki/Damage_Formula>

[^strategy-units]: StrategyWiki, *Advance Wars 2: Black Hole Rising/Units*.  
<https://strategywiki.org/wiki/Advance_Wars_2%3A_Black_Hole_Rising/Units>

[^terrain-defense]: Advance Wars Wiki, *Terrain*, defense section.  
<https://advancewars.fandom.com/wiki/Terrain>

[^repairing]: Advance Wars Wiki, *Repairing*.  
<https://advancewars.fandom.com/wiki/Repairing>

[^repair-manual]: Nintendo official manual, property repair and resupply description.  
<https://www.nintendo.com/eu/media/downloads/games_8/emanuals/game_boy_advance_8/Manual_GameBoyAdvance_AdvanceWars2BlackHoleRising_EN_DE_FR_ES_IT.pdf>

[^terrain-overview]: General terrain and fog behavior cross-checked against the Nintendo manual and terrain references.  
<https://advancewars.fandom.com/wiki/Terrain>
