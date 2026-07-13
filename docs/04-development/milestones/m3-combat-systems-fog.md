# Iron Grid — M3 · Engine combat, systems & fog (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Engine contributors

> This is the **execution-detail** breakdown of milestone **M3** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the engine contract is `architecture.md` §4 and
> `rules.yaml` → `engine_contract`; the runtime state shape is `domain-model.md`
> and `rules.yaml` → `state_model`; behavior is `game-specification.md`
> §6/§12–§23; the exit gate is `game-specification.md` §34, `testing.md`, and
> `coding-standards.md` §11–§12. The just-in-time blocker map is `roadmap.md` §6.

---

# 1. Purpose

M3 completes the **pure engine** (`packages/game-engine`). On the M2 foundation —
the immutable state model, start-of-turn, movement, legal-actions and the
move/end-turn transitions — it builds the rest of the game systems: **combat**
(damage matrix, weapon selection, counterattack, destruction, deterministic
luck), **capture**, **production**, **repair/resupply/join**, **transport and
submarine**, **fog of war** (visibility and the private per-player projection),
and **victory/defeat**. It also lands the **declarative commander-modifier and
power-meter mechanism** as inert, data-driven plumbing, and fills the five
**M3 no-op hooks** M2 left ordered inside `resolveStartOfTurn`
(repair, resupply, commander-power, visibility, victory).

After M3 all nine `engine_contract` functions are implemented: M2 delivered
`resolveStartOfTurn`, `calculateMovementRange`, `calculateLegalActions`,
`validateAction` and `applyAction`; M3 adds `calculateCombatPreview`,
`calculateVisibility`, `projectStateForPlayer` and `evaluateVictory`, and extends
`validateAction`/`applyAction` with every remaining action type in scope.

**Current state** (starting point): `packages/game-engine` implements the M2
slice — state model + helpers, `resolveStartOfTurn`, movement (`movement.ts`),
`validate.ts`/`apply.ts` for `move_and_wait`/`end_turn`, `legal-actions.ts`, the
purity/forbidden-dependency guards (119 tests, full gate green). `Action`/`Event`
carry precise M2 variants and `Future*` placeholders for the rest; the four M3
contract functions throw "not implemented until M3". `game-data` (M1) supplies
the validated `GameData` — including `damage-chart.yaml`, `weapons.yaml` and the
per-terrain vision/defense values M3 consumes.

---

# 2. Gates for M3

- **Entry (DoR):** each ticket is specified with goal, scope, files and
  acceptance; the reference data it consumes exists and validates (M1). **No open
  §33 blocker applies to the ticket's scope** — the blocked pieces are *excluded,
  not inferred*: **Missile Silo** radius/damage (§20.3, §33.5) and art (§33.3);
  **real commander** names/effects/powers/costs (§33.1) and the **CO-meter charge
  formula** (§22.5, §33.5); and **day-limit scoring** weights/tie-breaks
  (§23.4, §33.2). The §33.5 edge cases that are **already resolved in structured
  data** — join-refund rounding (`rules.yaml` → `join_rules.excess_hp_refund`,
  §15.3), fog hidden-collision fuel (`movement_rules.hidden_collision`, §18.5) and
  partial repair with insufficient funds (`income_repair_resupply_rules.repair`,
  §14.4) — are in scope and carry their verification tests. The **elimination-
  timing** edge (§23.2, §33.5) is scoped in T7 below.
- **Exit (DoD):** the **pure-engine** slice of the Functional Definition of Done
  (`game-specification.md` §34: rule specified, data validates, **pure-engine
  tests pass**, no hardcoded unit/terrain/property/commander names in engine
  logic) plus the code-change bar (`coding-standards.md` §11–§12) and the
  purity/determinism contract. Server authorization, fog-information-leak in
  transport/replay, concurrency and replay-determinism suites belong to the
  layers that add them (M7, M11, M12); M3 lands the projection primitive they
  build on. The milestone-level DoD is in §5.

---

# 3. Cross-cutting decisions

- **Purity holds; randomness is now consumed — but only by combat.** Every
  function stays `f(state, …, gameData[, randomSource]) → { nextState, events }`
  over `readonly` inputs, with no I/O, clock or `Math.random`; the purity and
  forbidden-dependency guards keep passing. Combat is the **first and only**
  consumer of the injected `RandomSource` (`rules.yaml` → `randomness`,
  `combat_rules`): luck is drawn from the named streams `combat_luck` /
  `combat_counter_luck`, the sequence index advances only on committed draws, the
  chosen result is **persisted in the combat event**, and replay reuses the
  persisted value rather than rerolling (§12.6). Capture, production, repair,
  transport, visibility and victory draw no randomness.
- **The M2 ordered hooks are filled in place, never reordered.**
  `resolveStartOfTurn` already runs the full `turn_sequence.start_of_turn`
  ordered step list with M3 steps present as identity hooks; M3 makes
  `repair`/`resupply` (T4), `commander-power` (T8), `visibility` (T6) and
  `victory` (T7) real **without** changing the pipeline's shape or order.
- **Data-driven, always** (`engine_contract`; §12.3, §22.4): base damage comes
  from the `damage-chart.yaml` matrix — **no approximate category multipliers**;
  a missing matrix entry means the matchup is illegal. Commander effects are
  declarative modifiers, **never name checks**. Everything resolves through
  `GameData`; `GameData` stays a **type-only** import.
- **Blocked scope is absent, not faked.** M3 ships no Missile Silo action, no
  invented commander values, no CO-meter charge formula, and no day-limit score.
  Where the roadmap places a *mechanism* in M3 (commanders §33.1; day-limit
  §33.2), M3 builds only the **inert, data-driven plumbing** that does nothing
  until approved data arrives, and proves it with **synthetic placeholder
  fixtures** — it does not read meaning into the disabled `commanders.yaml`.
- **Visibility is server-truth; the engine emits the private view.** `calculate
  Visibility` derives a player's visible tiles from units/properties/terrain/
  detection (§18.2–§18.4); `projectStateForPlayer` filters authoritative state to
  the per-player view (§18.7). Visibility is recomputed after every mutating step
  (§18.6). The engine never returns hidden state; the replay/fog-leak and
  concurrency **suites** are M11/M12, but the projection they rely on lands here.
- **Elimination and rounding get dedicated tests.** Army-elimination timing
  (§23.2) is tested explicitly; the combat-formula rounding boundaries (§12.4) and
  the join-refund formula (§15.3) are asserted against known values.
- **Test depth is focused** (`testing.md` §2, [[testing-depth-preference]]): anchor
  to the §35 scenarios in M3 scope — **#1–#3** capture, **#6–#13** combat/ammo,
  **#14–#16** repair/supply/join, **#17–#18** transport, **#19** submarine
  (reaffirmed; the daily-fuel branch landed in M2), **#21** fog hiding — and do not
  chase coverage. (**#20** landed in M2; **#22–#24** are M11/M7.)

---

# 4. Tickets

## M3-T1 · Combat core: damage, counterattack, destruction, luck
- **Goal:** the authoritative combat resolution and its non-authoritative preview
  (`game-specification.md` §12; `rules.yaml` → `combat_rules`, `randomness`).
- **Scope:**
  - The **damage formula** exactly as specified (§12.4, `combat_rules.formula`):
    attack component (base damage × attack value / 100 + goodLuck − badLuck),
    HP-scaling, defense factor with `terrain_stars × defender displayed HP`
    (`terrain.yaml`; **zero stars for air units**, §35 #11), clamp, the two-stage
    AW2 rounding (up to 0.05, then down to integer), convert to true-HP damage,
    clamp to remaining true HP.
  - **Weapon selection** (§12.2): primary if it has ammo and can damage the target
    category, else secondary, else illegal; base damage strictly from the matrix
    (`damage-chart.yaml`); a missing entry ⇒ illegal (§12.3).
  - **Direct vs indirect** (§12.1): direct may move-then-attack; indirect attacks
    within min/max range and **cannot move and fire** the same activation (§35 #6);
    the `attack` action reuses M2-T3 path validation for the move component of a
    direct attack.
  - **Counterattack** (§12.8): only when the attack is direct, the defender
    survives, has a valid weapon and required ammo, and the attacker stays in
    range; uses the defender's **post-hit** HP, the same formula, its **own**
    deterministic luck roll, and consumes ammo. Indirect attacks are never
    countered (§35 #7, #8, #9).
  - **Destruction** (§12.9): true HP 0 ⇒ remove from board, destroy all cargo,
    cancel capture tied to the unit, emit `unit_destroyed` (+ `cargo_destroyed`),
    signal victory re-evaluation (T7). Ammo decrements by one on a primary attack
    (§35 #12); secondary is chosen when primary is unavailable (§35 #13).
  - **Deterministic luck** (§12.6, §3): draw from `combat_luck` /
    `combat_counter_luck`, persist the value in the event, advance the sequence
    index on commit; default modifiers are the §12.5 baseline (attack/defense 100,
    goodLuck 0–9, badLuck 0) — the **declarative commander source is T8**.
  - `calculateCombatPreview` (§12.7): min/max expected damage and the expected
    counterattack range for **visible** combat, revealing no hidden information.
- **Files:** `packages/game-engine/src/combat.ts`,
  `packages/game-engine/src/damage.ts` (pure formula, heavily unit-tested),
  `attack` wiring in `validate.ts`/`apply.ts`, refined `Action`/`Event` variants,
  tests (including every rounding boundary, §12.4).
- **Acceptance:** the formula matches known AW2 values at each rounding boundary;
  terrain defense scales with defender displayed HP (§35 #10) and is zero for air
  (§35 #11); a surviving direct defender counterattacks (§35 #7) but an indirect
  attack is never countered (§35 #8) nor is a target the defender cannot damage
  (§35 #9); Artillery cannot move and fire (§35 #6); primary ammo decrements
  (§35 #12) and secondary is selected when primary is unavailable (§35 #13);
  identical input + seed yields identical damage and persisted luck.
- **Dependencies:** M2 complete.

## M3-T2 · Capture
- **Goal:** the capture action and its continuity/completion rules
  (`game-specification.md` §13; `rules.yaml` → capture data in `properties.yaml`).
- **Scope:**
  - `capture` action: only Infantry/Mech (§13.1) on a capturable property
    (§13.2); subtract the capturing unit's **displayed** HP from the remaining
    capture points (§13.3); a direct move-then-capture reuses M2-T3 path
    validation.
  - **Continuity** (§13.4): progress persists only while the same living unit
    stays and continues on a later owner turn; resets to 20 when the unit leaves,
    is destroyed, or the property changes owner. Damage does not reset progress
    but lowers the next contribution. The `captureTargetPropertyId` /
    `capturingUnitId` state fields (M2-T1) track this; leaving/destruction clears
    them (destruction path in T1).
  - **Completion** (§13.5): at ≤ 0 points ownership flips immediately, points
    reset to 20, and capturing the enemy **HQ** signals immediate victory (T7);
    income/repair follow the new owner from the next start-of-turn.
- **Files:** `packages/game-engine/src/capture.ts`, `capture` wiring in
  `validate.ts`/`apply.ts`, refined `Action`/`Event` variants, tests.
- **Acceptance:** a 10-HP Infantry captures a neutral City over two uninterrupted
  owner turns (§35 #1); capture resets when the unit leaves (§35 #2); a damaged
  Infantry contributes its displayed HP (§35 #3); HQ capture raises the victory
  signal.
- **Dependencies:** M2; destruction/cancel-capture path from M3-T1.

## M3-T3 · Production
- **Goal:** unit production from owned production properties (§6.4;
  `rules.yaml` → `production_rules`).
- **Scope:** `produce` action — legal only when the match is active, it is the
  requester's turn, the property is owned and empty, its category matches the
  unit, the unit is enabled, and funds suffice (§6.4). On success: deduct cost
  atomically (no negative funds, §6.5), create the unit at full HP/fuel/ammo with
  `has_acted = true` and `createdTurn = currentDay`, emit `unit_produced`. Costs
  are read from `units.yaml` (never client-supplied).
- **Files:** `packages/game-engine/src/production.ts`, `produce` wiring in
  `validate.ts`/`apply.ts`, refined `Action`/`Event` variants, tests.
- **Acceptance:** production deducts the versioned cost and places an acted, full-
  state unit; it is rejected on an occupied/foreign/wrong-category property, an
  disabled unit, or insufficient funds; a produced unit offers no actions this
  turn (via `calculateLegalActions`).
- **Dependencies:** M2.

## M3-T4 · Repair, resupply & join
- **Goal:** start-of-turn repair/resupply, APC supply, and the join action
  (§14, §15; `rules.yaml` → `income_repair_resupply_rules`, `supply_rules`,
  `join_rules`).
- **Scope:**
  - Fill the **`repair` and `resupply` ordered hooks** inside `resolveStartOfTurn`
    (M2 left them identity): a unit on an **owned compatible** property (§14.2)
    restores up to 2 displayed HP, refills fuel and primary ammo (§14.1); repair
    cost is `floor(unitCost × 0.10)` per displayed HP (§14.3), **partial when
    funds are short** — whole displayed-HP steps only, never negative funds, and
    fuel/ammo still resupply (§14.4, §33.5-resolved). Emits `unit_repaired` /
    `unit_resupplied`.
  - `supply` action: APC refills an adjacent allied unit's fuel and primary ammo
    to maximum (no HP), consuming the APC's activation (§14.5).
  - `join` action: two same-owner, same-type units combine — true HP to 100, fuel
    and ammo to their maxima, the result marked acted, the source deleted, one
    `units_joined` event with before/after values, and **excess-HP refund**
    `floor(unitCost × excessTrueHp / 100)` added to funds (§15, §33.5-resolved
    rounding). Reuses M2-T3 movement to reach the destination.
- **Files:** `packages/game-engine/src/repair.ts` (start-of-turn hooks),
  `packages/game-engine/src/join.ts`, `supply`/`join` wiring in
  `validate.ts`/`apply.ts`, refined `Action`/`Event` variants, tests.
- **Acceptance:** a unit on a compatible owned property repairs up to 2 HP and
  pays the exact funds, repairing partially when funds are short without going
  negative (§35 #14); an APC resupplies an adjacent ally's fuel/ammo without
  repairing HP (§35 #15); a join combines HP/fuel/ammo and refunds excess by the
  formula (§35 #16).
- **Dependencies:** M2 (start-of-turn hooks, movement).

## M3-T5 · Transport & submarine
- **Goal:** load/unload with cargo integrity, and the submarine dive/surface
  states (§16, §19; `rules.yaml` → `transport_rules`, `submarine_rules`).
- **Scope:**
  - `load` / `unload` (§16.2, §16.3): capacity and allowed-cargo from
    `units.yaml`; loaded cargo is removed from board occupancy and marked acted
    (§35 #18); unload places cargo on an adjacent legal, empty, terrain-compatible
    tile (multiple distinct destinations when capacity permits); no nested
    transport.
  - **Cargo destruction** (§16.4): destroying a transport destroys all cargo
    atomically — the combat/destruction path (T1) already cascades `cargo_
    destroyed`; T5 guarantees the atomicity and the occupancy invariant (§35 #17).
  - `dive` / `surface` (§19.2): explicit actions that consume the activation and
    flip `specialState`; the per-state **daily fuel** already burns in
    `resolveStartOfTurn` (M2), so #19 is reaffirmed, not re-implemented. Detection
    data (cruiser as primary detector, range 1) is surfaced for T6 to consume.
  - **Cargo visibility** rule (§16.5) is honored by the projection in T6; T5 keeps
    the cargo state private within the transport.
- **Files:** `packages/game-engine/src/transport.ts`,
  `packages/game-engine/src/submarine.ts`, `load`/`unload`/`dive`/`surface`
  wiring in `validate.ts`/`apply.ts`, refined `Action`/`Event` variants, tests.
- **Acceptance:** loaded cargo is not board-occupying (§35 #18); destroying a
  transport destroys its cargo atomically (§35 #17); dive/surface flip the state
  and consume the activation; the submarine daily-fuel branch remains correct
  (§35 #19).
- **Dependencies:** M2; destruction/cascade from M3-T1.

## M3-T6 · Fog of war: visibility & private projection
- **Goal:** `calculateVisibility` and `projectStateForPlayer`, plus fog-aware
  movement (§18; `rules.yaml` → `fog_of_war_rules`, `movement_rules.hidden_
  collision`).
- **Scope:**
  - `calculateVisibility` (§18.2–§18.4): a player's visible tiles from owned
    units' base vision (`units.yaml`), owned properties, the Mountain vision bonus
    for Infantry/Mech (`terrain.yaml`), and detection rules. **Hidden terrain**:
    ground units in Forest and naval units in Reef are hidden unless an adjacent
    enemy reveals them; **air units never hide**; **submerged submarines** are
    hidden except to a valid detector (Cruiser, range 1, from T5) (§35 #21).
  - `projectStateForPlayer` (§18.7): filter authoritative state to the viewer —
    hide units on non-visible tiles, hide **cargo identity** (§16.5), never leak
    hidden positions. The engine returns only the filtered view.
  - **Hidden-collision movement** (§18.5, `movement_rules.hidden_collision`, the
    edge M2 deferred): under fog, movement onto an unseen enemy stops at the
    collision, reveals the minimum, and **charges fuel for the committed traversed
    path through the stopping point**; the per-player action events are filtered
    independently.
  - **Recompute after every mutating step** (§18.6) — the `visibility` ordered
    hook in `resolveStartOfTurn` (M2 identity) becomes real, and post-action
    visibility is recomputed where §18.6 requires.
- **Files:** `packages/game-engine/src/visibility.ts`,
  `packages/game-engine/src/projection.ts`, fog branch in `movement.ts`, hook fill
  in `start-of-turn.ts`, tests.
- **Acceptance:** Forest hides ground and Reef hides naval until an adjacent enemy
  reveals them, while air never hides (§35 #21); a submerged submarine is hidden
  except to an adjacent Cruiser; `projectStateForPlayer` omits every non-visible
  unit and all cargo identity; a fog collision stops movement and charges the
  committed-path fuel. *(The replay/no-leak suite is M11.)*
- **Dependencies:** M2 (movement, start-of-turn hook); M3-T5 (submarine
  detection, cargo state).

## M3-T7 · Victory & defeat evaluation
- **Goal:** `evaluateVictory` and its wiring into the ordered pipeline (§23;
  `rules.yaml` → victory data).
- **Scope:** evaluate the standard conditions the engine owns — **enemy HQ
  captured** (from T2's HQ signal, §13.5/§23.1) and **army elimination** (§23.2).
  Fill the M2 `victory` ordered hook in `resolveStartOfTurn` and evaluate after a
  completed atomic action (§23.2 timing). On a decisive result set
  `status = completed`, `winnerPlayerId`, `completionReason` and emit
  `match_completed`. **Elimination timing** (the §33.5 edge): a temporary
  zero-unit state during an atomic action is judged by the resolved end-of-action
  state, with a **dedicated test** (§23.2). Resignation and Claim-Victory are
  backend triggers (M7/M8); **day-limit scoring is out** (§23.4/§33.2, gated) —
  `evaluateVictory` exposes the extension point but computes no score.
- **Files:** `packages/game-engine/src/victory.ts`, hook fill in
  `start-of-turn.ts`, post-action evaluation in `apply.ts`, tests.
- **Acceptance:** capturing the enemy HQ completes the match for the capturer;
  reducing a player's army to zero eliminates them under the resolved end-of-
  action state (dedicated timing test); a non-decisive state completes nothing;
  day-limit scoring is absent, not invented.
- **Dependencies:** M3-T1 (destruction), M3-T2 (HQ capture).

## M3-T8 · Declarative commander modifiers & power meter (inert plumbing)
- **Goal:** the **data-driven** commander-modifier application points and the
  power-meter/`activate_power` skeleton, built **without inventing any commander
  value** (§22.4–§22.5; blocked by §33.1 and the §33.5 CO-meter charge).
- **Scope:**
  - A single **effective-modifier resolver** consumed at the declared points —
    attack/defense (T1 combat), movement (M2 movement), vision (T6), capture (T2),
    income (start-of-turn, T4/§6) — reading `passive.*Modifiers` /
    `power.modifiers` from `commanders.yaml` **declaratively, with no name checks**
    (§22.4). With the current **disabled** commander data the resolver is the
    identity, so every earlier ticket's default (§12.5 baseline, etc.) is
    preserved; the wiring is proven only with **synthetic placeholder fixtures**.
  - **Power-meter plumbing**: the `powerMeter` state field (M2-T1) and an
    `activate_power` action whose **structural** legality (ownership, active turn,
    meter-cost availability, no Super Power) is validated, but whose
    `immediateEffects`/`modifiers` are applied **only** from data — vacuous under
    the placeholder fixtures. The **meter charge formula is gated** (§22.5, §33.5):
    M3 adds **no** charge logic; the meter does not grow.
  - Explicitly **out** (not DoR until §33.1/§33.5 ADRs): real commander
    names/effects/powers/costs, the charge formula, and any power that is not a
    pure declarative modifier.
- **Files:** `packages/game-engine/src/commanders.ts` (modifier resolver + power
  skeleton), modifier call-sites in `combat.ts`/`movement.ts`/`visibility.ts`/
  `capture.ts`/`start-of-turn.ts`, `activate_power` wiring in
  `validate.ts`/`apply.ts`, tests over placeholder fixtures.
- **Acceptance:** with a synthetic placeholder commander granting, e.g., a +10
  attack modifier, combat reflects it through the resolver — proving the wiring —
  while the real `commanders.yaml` (disabled) leaves every system at its default;
  `activate_power` validates structurally; no meter charge is computed and no
  commander value is hardcoded.
- **Dependencies:** M3-T1, M3-T2, M3-T4, M3-T6 (the modifier call-sites).

**Ordering:** M3-T1 → { M3-T2 ∥ M3-T3 ∥ M3-T4 ∥ M3-T5 } → { M3-T6 ∥ M3-T7 } →
M3-T8. (T2–T5 depend only on T1/M2; T6 also needs T5; T7 needs T1+T2; T8 threads
through the finished call-sites last.)

---

# 5. Definition of Done for M3

M3 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and
   `pnpm build` are all green.
2. `packages/game-engine` implements all four remaining `engine_contract`
   functions — `calculateCombatPreview`, `calculateVisibility`,
   `projectStateForPlayer`, `evaluateVictory` — and resolves every M3 action type
   (`attack`, `capture`, `produce`, `supply`, `join`, `load`, `unload`, `dive`,
   `surface`, `activate_power`) through `validateAction`/`applyAction`, each pure,
   deterministic and consuming `GameData` on every call.
3. Combat is deterministic through the injected `RandomSource` with persisted
   luck (`combat_luck` / `combat_counter_luck`); no other system draws randomness;
   the purity and forbidden-dependency guards still pass; no hardcoded
   unit/terrain/property/commander names appear in engine logic.
4. The five M2 ordered hooks — repair, resupply, commander-power, visibility,
   victory — are now real inside `resolveStartOfTurn`, preserving the canonical
   step order.
5. Pure-engine tests cover §35 **#1–#3**, **#6–#19** and **#21**, the combat
   rounding boundaries (§12.4), the join-refund formula (§15.3) and the
   elimination-timing rule (§23.2), and are green under CI.
6. The blocked features are **absent, not faked**: no Missile Silo action, no
   invented commander values or CO-meter charge, and no day-limit score; the
   commander mechanism is inert plumbing proven only by placeholder fixtures.

---

# 6. Cross-references

- `roadmap.md` — M3's place in the sequence (§5), the layered strategy (§2), and
  the §33 blocker → milestone map (§6).
- `architecture.md` — §4 the engine package boundary and forbidden dependencies;
  §3/§11 the data→engine layer order.
- `rules.yaml` → `engine_contract`, `state_model`, `combat_rules`, `randomness`,
  `movement_rules.hidden_collision`, `join_rules`, `supply_rules`,
  `transport_rules`, `submarine_rules`, `production_rules`,
  `income_repair_resupply_rules`, `fog_of_war_rules`, `turn_sequence`.
- `domain-model.md` — the runtime entities and invariants combat/capture/
  transport/visibility encode (§6–§15).
- `game-specification.md` — §6 economy/production, §12 combat, §13 capture, §14
  repair/resupply, §15 join, §16 transport, §17 fuel/ammo, §18 fog, §19 submarine,
  §22 commanders, §23 victory, §33 blockers, §34 Definition of Done, §35
  acceptance scenarios.
- `testing.md` — the pure-engine test layer and the focused-depth principle.
- `coding-standards.md` — §5 discriminated unions / no `any`, §11–§12 the bar.
- `definition-of-ready.md` — the entry gate each ticket satisfies; §3.3 the JIT
  blocker-resolution rule.
- `milestones/m2-engine-core.md` — the M2 foundation and the ordered hooks M3
  fills.
