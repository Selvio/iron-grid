import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { matches } from "../db/schema/matches";

/**
 * Invitation-code generation (M6-T2).
 *
 * Six characters from the alphanumeric set **minus the ambiguous glyphs**
 * `0/O/1/I` (`match_lifecycle.invitation`, spec §3.3, `database.md` §5.2), drawn
 * with a CSPRNG so codes are unguessable. `matches.invitation_code` is unique
 * (the landed `matches_invitation_code_key`); the generator retries on the rare
 * collision, and the unique index is the final backstop at insert time.
 *
 * @see docs/02-data/rules.yaml → match_lifecycle.invitation
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T2)
 */

/** Alphanumerics minus the ambiguous `0`, `O`, `1`, `I` (24 letters + 8 digits). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_UNIQUE_ATTEMPTS = 10;

/** Generates one unambiguous six-character invitation code. */
export function generateInvitationCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Generates an invitation code not currently present on any match.
 *
 * The pre-check keeps the common path collision-free; the unique index remains
 * the authoritative guard against a concurrent duplicate at insert time.
 *
 * @throws if a free code is not found within {@link MAX_UNIQUE_ATTEMPTS} tries
 *   (astronomically unlikely across a 32^6 space).
 */
export async function generateUniqueInvitationCode<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>): Promise<string> {
  for (let attempt = 0; attempt < MAX_UNIQUE_ATTEMPTS; attempt += 1) {
    const code = generateInvitationCode();
    const [existing] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.invitationCode, code))
      .limit(1);
    if (existing === undefined) return code;
  }
  throw new Error(
    "Could not generate a unique invitation code after multiple attempts.",
  );
}
