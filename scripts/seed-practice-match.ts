import { randomBytes, randomUUID } from "node:crypto";

import { loadGameData } from "game-data";
import { createInitialMatchState, resolveStartOfTurn } from "game-engine";
import { eq } from "drizzle-orm";

import { createDatabase } from "@/app/server/db";
import { persistMatchSnapshot } from "@/app/server/db/queries/matches";
import { sessions } from "@/app/server/db/schema/auth";
import { matchPlayers } from "@/app/server/db/schema/match-players";
import { matches } from "@/app/server/db/schema/matches";
import { users } from "@/app/server/db/schema/users";

/**
 * Dev-only seed: a **practice / hotseat** match you play solo (M10 testing aid).
 *
 * Creates (or reuses) a user for the given email, a login session, and an ACTIVE
 * `crossfire-basin` match where the SAME user owns both sides. The action
 * pipeline resolves the caller to whichever side is active (see
 * `requireMatchMembership` `preferPlayerId`), so you move blue, End turn, move
 * red, and so on. Prints the session cookie to set and the /play URL.
 *
 * Run: `pnpm seed:match [email]`
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */

const email = process.argv[2] ?? "dev@iron-grid.test";
const MAP_ID = "crossfire-basin";

async function main(): Promise<void> {
  const db = createDatabase();
  const gameData = loadGameData();
  const map = gameData.maps[MAP_ID];
  if (map === undefined) {
    throw new Error(`Map "${MAP_ID}" is not in game data — author it first.`);
  }

  // 1. User (reuse by email, else create).
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (user === undefined) {
    [user] = await db.insert(users).values({ email }).returning();
  }

  // 2. Login session — set this token as the `authjs.session-token` cookie.
  const sessionToken = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    sessionToken,
    userId: user.id,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // 3. Match + both player rows (same user on both sides).
  const matchId = randomUUID();
  const hostId = randomUUID();
  const guestId = randomUUID();
  await db.insert(matches).values({
    id: matchId,
    status: "ready_check",
    mapId: MAP_ID,
    settings: { fogEnabled: false, turnDeadline: "none", dayLimit: null },
    invitationCode: randomBytes(3).toString("hex").toUpperCase(),
  });
  await db.insert(matchPlayers).values([
    {
      id: hostId,
      matchId,
      userId: user.id,
      role: "host",
      factionId: "blue",
      commanderId: "commander_blue",
      isReady: true,
    },
    {
      id: guestId,
      matchId,
      userId: user.id,
      role: "guest",
      factionId: "red",
      commanderId: "commander_red",
      isReady: true,
    },
  ]);

  // 4. Activate: build the initial state, run the first start-of-turn, persist.
  const seed = randomBytes(16).toString("hex");
  const startedAt = new Date();
  const initial = createInitialMatchState(
    {
      matchId,
      dataVersion: gameData.version,
      map,
      roster: [
        {
          playerId: hostId,
          userId: user.id,
          slot: "player_1",
          factionId: "blue",
          commanderId: "commander_blue",
        },
        {
          playerId: guestId,
          userId: user.id,
          slot: "player_2",
          factionId: "red",
          commanderId: "commander_red",
        },
      ],
      firstPlayerId: hostId,
      seed,
      startedAt: startedAt.toISOString(),
      fogEnabled: false,
    },
    gameData,
  );
  const started = resolveStartOfTurn(initial, gameData);
  await persistMatchSnapshot(db, matchId, started.nextState);
  await db
    .update(matches)
    .set({
      status: "active",
      gameDataVersion: gameData.version,
      randomSeed: seed,
      activatedAt: startedAt,
    })
    .where(eq(matches.id, matchId));

  const cookie = process.env.AUTH_URL?.startsWith("https")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  console.log(`
✅ Practice match seeded.

  User:   ${email} (${user.id})
  Match:  ${matchId}  (crossfire-basin, active, hotseat)

To log in without email, set this cookie in your browser (DevTools → Application →
Cookies → http://localhost:3000):

  name:   ${cookie}
  value:  ${sessionToken}

Then open:

  http://localhost:3000/matches/${matchId}/play

You control whichever side is active. End turn to switch armies (blue ↔ red).
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
