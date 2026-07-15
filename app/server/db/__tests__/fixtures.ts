import { type MatchSettings, matches } from "../schema/matches";
import type { TestDb } from "./harness";

/** Default host settings for test matches. */
export const DEFAULT_SETTINGS: MatchSettings = {
  fogEnabled: false,
  turnDeadline: "24h",
  dayLimit: null,
};

/** Inserts a minimal `draft` match so FK-dependent rows can reference it. */
export async function insertDraftMatch(
  handle: TestDb,
  id = "match-1",
  invitationCode = "ABC234",
): Promise<void> {
  await handle.db.insert(matches).values({
    id,
    status: "draft",
    mapId: "map-1",
    settings: DEFAULT_SETTINGS,
    invitationCode,
  });
}
