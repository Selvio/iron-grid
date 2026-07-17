import { z } from "zod";

/**
 * Form-validation schemas (M9-T3).
 *
 * These mirror the server's accepted request shapes (`coding-standards.md` §9;
 * `rules.yaml → match_lifecycle.creation.allowed_configuration`,
 * `commander_rules`) so react-hook-form catches invalid input inline — the
 * server stays the authority (its typed `400/422` is still surfaced). The
 * backend hand-wrote its validators, so these are a client convenience, not a
 * shared source of truth.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T3)
 */

/** Host turn-deadline options (`MatchSettings.turnDeadline`). */
export const turnDeadlineSchema = z.enum(["24h", "3d", "7d", "none"]);

/**
 * Create-match form. Fog is **not** a field: the backend rejects
 * `fogEnabled: true` (M7 guard), so the form never offers an enabled path and
 * the client always submits fog off (§3, M9-T5).
 */
export const createMatchSchema = z.object({
  mapId: z.string().min(1, "Choose a map."),
  turnDeadline: turnDeadlineSchema,
  dayLimit: z.number().int().positive().nullable(),
});
export type CreateMatchInput = z.infer<typeof createMatchSchema>;

/**
 * Join-by-code form — six unambiguous alphanumerics (§3.3). The server alphabet
 * excludes the ambiguous `I O 0 1` (`invitation-code.ts`); the client accepts
 * either case and upper-cases before sending.
 */
export const joinMatchSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^[A-HJ-NP-Za-hj-np-z2-9]{6}$/,
      "Enter the 6-character invitation code.",
    ),
});
export type JoinMatchInput = z.infer<typeof joinMatchSchema>;

/** Commander selection — an id only; names are design-blocked (§33.1). */
export const commanderSelectSchema = z.object({
  commanderId: z.string().min(1, "Choose a commander."),
});
export type CommanderSelectInput = z.infer<typeof commanderSelectSchema>;
