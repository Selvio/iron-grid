/**
 * `game-data` — reads the canonical `docs/02-data/*.yaml` and validates it (Zod)
 * into a typed, versioned `GameData` object consumed by the engine.
 *
 * This is the package skeleton (milestone M0-T2); the schemas and loader are
 * implemented in milestone M1.
 *
 * @see docs/03-architecture/architecture.md §6 (game-data pipeline)
 * @see docs/04-development/milestones/m0-foundations.md (M0-T2)
 */

/** Package identifier — placeholder export until the M1 loader lands. */
export const GAME_DATA_PACKAGE = "game-data" as const;
