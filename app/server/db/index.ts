/**
 * Public entry point for the server-only database layer (M4-T1).
 *
 * Only the backend imports this; the pure packages never do
 * (`architecture.md` §4). The `forbidden-import` guard test enforces that
 * boundary.
 *
 * @see docs/03-architecture/database.md
 */
export { createDatabase, type Database, type Schema } from "./client";
export { requireDatabaseUrl } from "./env";
export * as schema from "./schema";
