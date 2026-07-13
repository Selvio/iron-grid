/**
 * The pure AW2-style damage formula (`game-specification.md` §12.4;
 * `rules.yaml` → `combat_rules.formula`).
 *
 * `computeDamage` maps a fully resolved set of inputs — base damage from the
 * matrix, attack/defense values, the drawn luck, both units' displayed HP, the
 * defender's terrain stars and remaining true HP — to the true-HP damage dealt.
 * It is a total, side-effect-free function so the rounding boundaries can be
 * pinned exactly (§12.4 requires a test at every boundary). Randomness lives
 * outside: the caller draws `goodLuck`/`badLuck` and passes them in.
 *
 * @see docs/02-data/rules.yaml → combat_rules.formula
 * @see docs/01-specification/game-specification.md §12.4
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T1)
 */

/** The resolved inputs to one damage calculation. */
export interface DamageInput {
  /** Base damage percentage from `damage-chart.yaml` for this matchup. */
  readonly baseDamage: number;
  /** Attacker attack value — 100 plus commander modifiers (§12.5; T8). */
  readonly attackValue: number;
  /** Defender defense value — 100 plus commander modifiers (§12.5; T8). */
  readonly defenseValue: number;
  /** Good-luck roll, inclusive (default range 0–9). */
  readonly goodLuck: number;
  /** Bad-luck roll, inclusive (default range 0–0). */
  readonly badLuck: number;
  /** Attacker displayed HP, `ceil(trueHp / 10)` (§9.2). */
  readonly attackerDisplayHp: number;
  /** Defender displayed HP, `ceil(trueHp / 10)` (§9.2). */
  readonly defenderDisplayHp: number;
  /** Defender terrain stars — `terrain.yaml` value, or 0 for air units (§12.4). */
  readonly terrainStars: number;
  /** Defender remaining true HP, the damage cap (§12.4 step 4). */
  readonly defenderTrueHp: number;
}

/** Round up to the nearest 0.05 (`combat_rules.formula` rounding stage one). */
function roundUpToNearestTwentieth(value: number): number {
  return Math.ceil(value * 20) / 20;
}

/**
 * Compute the true-HP damage one hit deals, following the formula's ordered
 * steps exactly: attack component, HP scaling, defense factor, clamp to zero,
 * round up to 0.05, floor to a whole percentage, then cap at the defender's
 * remaining true HP.
 */
export function computeDamage(input: DamageInput): number {
  const attackComponent =
    (input.baseDamage * input.attackValue) / 100 +
    input.goodLuck -
    input.badLuck;

  const healthScaledAttack = (attackComponent * input.attackerDisplayHp) / 10;

  const defenseFactor =
    (200 -
      (input.defenseValue + input.terrainStars * input.defenderDisplayHp)) /
    100;

  const rawDamage = healthScaledAttack * defenseFactor;
  const clamped = Math.max(0, rawDamage);
  const percentage = Math.floor(roundUpToNearestTwentieth(clamped));

  return Math.min(input.defenderTrueHp, percentage);
}
