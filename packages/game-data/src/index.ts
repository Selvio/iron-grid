/**
 * `game-data` — reads the canonical `docs/02-data/*.yaml` and validates it (Zod)
 * into a typed, versioned `GameData` object consumed by the engine.
 *
 * Public surface of the package. The M1-T1 scaffold exposes the loader, the
 * `GameData` shape and the error type; per-file schemas narrow the payloads in
 * later M1 tickets.
 *
 * @see docs/03-architecture/architecture.md §6 (game-data pipeline)
 * @see docs/04-development/milestones/m1-game-data.md (M1)
 */

export { loadGameData } from "./load";
export { DATA_FILES } from "./game-data";
export type { GameData, DataFileName } from "./game-data";
export { GameDataError } from "./errors";
export type { GameDataIssue } from "./errors";
