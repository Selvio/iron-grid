/**
 * `game-engine` — the pure, deterministic, framework-free core of Iron Grid.
 *
 * It is a pure function of `(state, action, gameData, randomSource)`: no I/O, no
 * wall-clock access, and randomness only from an injected source. Framework
 * dependencies are forbidden and enforced by a guard (see
 * `forbidden-deps.test.ts`).
 *
 * This is the package skeleton (milestone M0-T3); the nine required public
 * functions (`validateAction`, `applyAction`, `projectStateForPlayer`, …) land in
 * milestones M2–M3.
 *
 * @see docs/02-data/rules.yaml → engine_contract
 * @see docs/03-architecture/architecture.md §5 (the pure engine)
 * @see docs/04-development/milestones/m0-foundations.md (M0-T3)
 */

/** Package identifier — placeholder export until the M2–M3 engine functions land. */
export const GAME_ENGINE_PACKAGE = "game-engine" as const;
