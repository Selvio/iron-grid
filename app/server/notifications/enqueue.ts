import { eq } from "drizzle-orm";
import type { MatchState } from "game-engine";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { cancelPendingJobs, enqueueNotificationJob } from "../db";
import { matchPlayers } from "../db/schema/match-players";
import type { MatchSettings } from "../db/schema/matches";
import { TURN_DEADLINE_MS } from "../lifecycle/turn-deadline";

/**
 * Notification scheduling at gameplay / lifecycle events (M8-T5).
 *
 * These enqueue `notification_jobs` **after** the gameplay transaction commits,
 * so they are never gameplay-authoritative — a scheduling failure never rolls
 * back or blocks a move (`notifications.gameplay_authority: false`; wrap calls in
 * {@link safelyEnqueue}). Enqueue is idempotent (per-turn dedupe key), so a retry
 * is harmless. The cron drain (M8-T6) delivers them.
 *
 * @see docs/03-architecture/backend.md §10
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T5)
 */

/** Reminder fires when ~20% of the turn time remains (`notifications.reminder`). */
const REMINDER_FRACTION = 0.2;

/** Reminder/expired job types, cancelled together on turn hand-off. */
const TURN_JOB_TYPES = ["turn_reminder", "turn_expired"] as const;

/** Runs an enqueue side effect, swallowing failures (never blocks gameplay). */
export async function safelyEnqueue(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Notifications are never gameplay-authoritative — a scheduling failure must
    // not surface as a gameplay error or roll anything back.
  }
}

/**
 * Schedules the notifications for a freshly started turn: the immediate
 * `turn_started` mail and, for a timed match, the `turn_reminder` (at ~20%
 * remaining) and `turn_expired` (at the deadline) jobs — cancelling the previous
 * player's outstanding reminder/expired on hand-off.
 */
export async function scheduleTurnNotifications<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  params: {
    readonly matchId: string;
    readonly activePlayerId: string;
    readonly turnDeadlineAt: string | null;
    readonly turnDeadline: MatchSettings["turnDeadline"];
    readonly now: Date;
    readonly priorActivePlayerId: string | null;
    readonly dedupeKey: string;
  },
): Promise<void> {
  const { matchId, activePlayerId, turnDeadlineAt, turnDeadline, now } = params;

  if (params.priorActivePlayerId !== null) {
    await cancelPendingJobs(db, matchId, params.priorActivePlayerId, [
      ...TURN_JOB_TYPES,
    ]);
  }

  await enqueueNotificationJob(db, {
    matchId,
    playerId: activePlayerId,
    type: "turn_started",
    scheduledAt: now,
    dedupeKey: params.dedupeKey,
  });

  const durationMs = TURN_DEADLINE_MS[turnDeadline];
  if (durationMs === null || turnDeadlineAt === null) return; // no deadline → no reminder

  const deadlineMs = new Date(turnDeadlineAt).getTime();
  await enqueueNotificationJob(db, {
    matchId,
    playerId: activePlayerId,
    type: "turn_reminder",
    scheduledAt: new Date(deadlineMs - durationMs * REMINDER_FRACTION),
    dedupeKey: params.dedupeKey,
  });
  await enqueueNotificationJob(db, {
    matchId,
    playerId: activePlayerId,
    type: "turn_expired",
    scheduledAt: new Date(deadlineMs),
    dedupeKey: params.dedupeKey,
  });
}

/** Enqueues a `match_completed` mail for both players and drops pending turn jobs. */
export async function scheduleCompletion<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  priorActivePlayerId: string,
  now: Date,
): Promise<void> {
  await cancelPendingJobs(db, matchId, priorActivePlayerId, [
    ...TURN_JOB_TYPES,
  ]);
  const players = await db
    .select({ id: matchPlayers.id })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));
  for (const player of players) {
    await enqueueNotificationJob(db, {
      matchId,
      playerId: player.id,
      type: "match_completed",
      scheduledAt: now,
      dedupeKey: "completed",
    });
  }
}

/**
 * Schedules the notifications implied by a committed action: completion mail if
 * the match ended, or the next turn's jobs if the action handed off the turn.
 * A mid-turn action schedules nothing.
 */
export async function scheduleForCommittedAction<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  params: {
    readonly committedState: MatchState;
    readonly priorActivePlayerId: string;
    readonly turnDeadline: MatchSettings["turnDeadline"];
    readonly now: Date;
  },
): Promise<void> {
  const meta = params.committedState.match;
  if (meta.status === "completed") {
    await scheduleCompletion(
      db,
      matchId,
      params.priorActivePlayerId,
      params.now,
    );
    return;
  }
  if (meta.activePlayerId !== params.priorActivePlayerId) {
    await scheduleTurnNotifications(db, {
      matchId,
      activePlayerId: meta.activePlayerId,
      turnDeadlineAt: meta.turnDeadlineAt ?? null,
      turnDeadline: params.turnDeadline,
      now: params.now,
      priorActivePlayerId: params.priorActivePlayerId,
      dedupeKey: `turn-${meta.stateVersion}`,
    });
  }
}

/** Enqueues a `match_invitation` mail to a recipient (a guest joined, M6). */
export async function scheduleInvitation<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  recipientPlayerId: string,
  now: Date,
): Promise<void> {
  await enqueueNotificationJob(db, {
    matchId,
    playerId: recipientPlayerId,
    type: "match_invitation",
    scheduledAt: now,
    dedupeKey: "invitation",
  });
}
