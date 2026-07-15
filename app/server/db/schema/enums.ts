import { pgEnum } from "drizzle-orm/pg-core";
import type { CompletionReason, MatchStatus } from "game-engine";

/**
 * Shared Postgres enum types, mirrored from `rules.yaml` → `enums` (M4-T3+).
 *
 * The value tuples are `satisfies`-checked against the engine's runtime
 * vocabularies so a typo or drift from `rules.yaml` fails to compile. Later M4
 * tickets append their enums here (T4 player role, T5 event types, T6
 * notification job type/status) so schema and code share one definition
 * (`coding-standards.md` §4).
 *
 * @see docs/02-data/rules.yaml → enums
 * @see docs/04-development/milestones/m4-persistence.md
 */

/** `rules.yaml` → enums.match_statuses. */
export const MATCH_STATUSES = [
  "draft",
  "waiting_for_opponent",
  "commander_selection",
  "ready_check",
  "active",
  "completed",
  "cancelled",
] as const satisfies readonly MatchStatus[];

export const matchStatus = pgEnum("match_status", MATCH_STATUSES);

/** `rules.yaml` → enums.completion_reasons. */
export const COMPLETION_REASONS = [
  "headquarters_captured",
  "army_eliminated",
  "resignation",
  "timeout_claimed",
  "day_limit_score",
  "administrative",
] as const satisfies readonly CompletionReason[];

export const completionReason = pgEnum("completion_reason", COMPLETION_REASONS);
