/**
 * Drizzle schema barrel (M4-T1).
 *
 * The per-table slices are added one M4 ticket at a time (T3 `matches`, then
 * T4 `match_players`, T5 event store, T6 idempotency/notifications) and
 * re-exported here so `drizzle.config.ts`, the runtime client and the test
 * harness all see a single schema object.
 *
 * @see docs/03-architecture/database.md §5
 * @see docs/04-development/milestones/m4-persistence.md
 */
export * from "./enums";
export * from "./matches";
export * from "./match-players";
export * from "./events";
export * from "./player-events";
