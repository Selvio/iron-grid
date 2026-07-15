import { pgEnum } from "drizzle-orm/pg-core";
import type { CompletionReason, EventType, MatchStatus } from "game-engine";

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

/**
 * Match-player role (`domain-model.md` §7). Not a `rules.yaml` runtime enum —
 * the host creates the match, the guest joins by invitation (§3.3).
 */
export const MATCH_PLAYER_ROLES = ["host", "guest"] as const;

export const matchPlayerRole = pgEnum("match_player_role", MATCH_PLAYER_ROLES);

/** `rules.yaml` → enums.event_types (the resolved authoritative event log). */
export const EVENT_TYPES = [
  "match_started",
  "turn_started",
  "income_granted",
  "unit_repaired",
  "unit_resupplied",
  "fuel_consumed",
  "unit_moved",
  "unit_blocked_by_fog",
  "unit_attacked",
  "unit_counterattacked",
  "unit_damaged",
  "unit_destroyed",
  "cargo_destroyed",
  "capture_started",
  "capture_progressed",
  "property_captured",
  "unit_produced",
  "unit_loaded",
  "unit_unloaded",
  "units_joined",
  "unit_supplied",
  "submarine_dived",
  "submarine_surfaced",
  "missile_launched",
  "terrain_damaged",
  "terrain_destroyed",
  "power_activated",
  "turn_ended",
  "player_resigned",
  "victory_claimed",
  "match_completed",
] as const satisfies readonly EventType[];

export const eventType = pgEnum("event_type", EVENT_TYPES);

/** `rules.yaml` → notifications.event_triggers (durable notification jobs). */
export const NOTIFICATION_TYPES = [
  "match_invitation",
  "turn_started",
  "turn_reminder",
  "turn_expired",
  "match_completed",
] as const;

export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);

/** Notification-job delivery status (`database.md` §5.7). */
export const NOTIFICATION_JOB_STATUSES = [
  "pending",
  "sent",
  "cancelled",
] as const;

export const notificationJobStatus = pgEnum(
  "notification_job_status",
  NOTIFICATION_JOB_STATUSES,
);
