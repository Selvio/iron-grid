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
export { persistMatchSnapshot } from "./queries/matches";
export {
  appendEvents,
  insertPlayerEvents,
  type AppendEventInput,
} from "./queries/events";
export {
  getIdempotentResult,
  recordIdempotentResult,
  type IdempotentOutcome,
} from "./queries/idempotency";
export {
  assertStateVersion,
  incrementStateVersion,
  lockMatchForUpdate,
  StateVersionConflictError,
  type LockedMatch,
} from "./queries/concurrency";
export {
  getPinnedGameDataVersion,
  pinGameDataVersion,
} from "./queries/versioning";
export {
  enqueueNotificationJob,
  claimDueJobs,
  markJobSent,
  markJobCancelled,
  cancelPendingJobs,
  type EnqueueNotificationJob,
  type NotificationJobType,
} from "./queries/notification-jobs";
export * as schema from "./schema";
