import type { MatchSettings } from "../db/schema/matches";

/**
 * Turn-deadline computation, shared by activation (M6) and the action pipeline
 * (M7).
 *
 * A fresh turn's deadline is stamped when its `turn_started` commits
 * (`time_model.deadline_starts`); the engine clears `turnDeadlineAt` and the
 * backend stamps the real instant off the host's `turnDeadline` setting
 * (`domain-model.md` §15 — the engine never reads the clock).
 *
 * @see docs/02-data/rules.yaml → time_model
 * @see docs/04-development/milestones/m7-actions.md (M7-T4)
 */

/** Turn-deadline durations in ms, or null for an untimed match. */
export const TURN_DEADLINE_MS: Record<
  MatchSettings["turnDeadline"],
  number | null
> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  none: null,
};

/** The ISO deadline instant for a turn starting at `now`, or null if untimed. */
export function computeTurnDeadline(
  deadline: MatchSettings["turnDeadline"],
  now: Date,
): string | null {
  const ms = TURN_DEADLINE_MS[deadline];
  return ms === null ? null : new Date(now.getTime() + ms).toISOString();
}
