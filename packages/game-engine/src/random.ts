/**
 * The injected deterministic randomness contract (`rules.yaml` → randomness).
 *
 * The engine never calls `Math.random`; all randomness comes from an injected
 * `RandomSource` backed by a stable, versioned PRNG seeded per match. Draws are
 * taken from **named streams** so unrelated random sequences (combat luck vs.
 * first-player selection) never interfere (`rules.yaml` → randomness.
 * non_combat_randomness.use_separate_named_streams).
 *
 * M2's functions (movement, income, end-turn) draw no randomness; this interface
 * is defined here and first consumed by M3 combat luck.
 *
 * @see docs/02-data/rules.yaml → randomness
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

/** Named random streams, kept separate so sequences never interfere. */
export type RandomStream =
  | "combat_luck"
  | "combat_counter_luck"
  | "first_player"
  | "commander_first_picker";

/** A deterministic source of integers, injected into the engine. */
export interface RandomSource {
  /**
   * Draw the next integer in `[minInclusive, maxInclusive]` from `stream`.
   * Deterministic for a given seed and prior draw count; replay reuses the
   * persisted result rather than redrawing (`rules.yaml` → randomness.replay).
   */
  nextInt(
    stream: RandomStream,
    minInclusive: number,
    maxInclusive: number,
  ): number;
}
