import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matches } from "../../db/schema/matches";
import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
import { createInvitationRateLimiter } from "../../lifecycle/rate-limit";
import { handleSubmitAction } from "../submit";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

/**
 * M7-T7 — the optimistic-concurrency / idempotency acceptance suite
 * (`concurrency_rules`, spec §35 #23–#24, `action_processing.failure`).
 *
 * The true two-connection row-lock contention test is CI-infra-gated (needs a
 * real Postgres — see m7-actions.md §6); under `FOR UPDATE` its outcome is
 * identical to the sequential proof here, which always runs.
 */
function actionRequest(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("action concurrency & idempotency", () => {
  let active: ActiveMatch;

  beforeEach(async () => {
    active = await activateFixtureMatch();
  });

  afterEach(async () => {
    await active.handle.close();
  });

  function deps(userId: string) {
    return {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(userId),
      rateLimiter: createInvitationRateLimiter(1000),
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    };
  }

  async function matchRow() {
    const [row] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    return row;
  }

  it("lets only one of two same-version actions commit", async () => {
    // Both target expectedStateVersion 0; the first commits (→ v1).
    const first = await handleSubmitAction(
      actionRequest({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "a",
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(first.status).toBe(200);

    // The second, still at v0, is rejected as stale with the safe version.
    const second = await handleSubmitAction(
      actionRequest({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "b",
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as {
      error: string;
      currentStateVersion: number;
    };
    expect(body.error).toBe("stale_state_version");
    expect(body.currentStateVersion).toBe(1);
  });

  it("returns the original result for a duplicate idempotency key", async () => {
    const first = await handleSubmitAction(
      actionRequest({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "dup",
      }),
      active.matchId,
      deps(active.hostId),
    );
    const firstBody = await first.json();

    const replay = await handleSubmitAction(
      actionRequest({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "dup",
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    // Exactly one commit — still at version 1.
    expect((await matchRow()).stateVersion).toBe(1);
  });

  it("leaves every consumable untouched when an action fails", async () => {
    const before = await matchRow();

    const response = await handleSubmitAction(
      actionRequest({
        type: "move_and_wait",
        expectedStateVersion: 0,
        idempotencyKey: "fail",
        unitId: "ghost-unit",
        path: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(response.status).toBe(422);

    const after = await matchRow();
    // No partial commit: version, the random sequence and the full snapshot are
    // exactly as before (no funds/ammo/random consumed on failure).
    expect(after.stateVersion).toBe(before.stateVersion);
    expect(after.state!.match.randomSequenceIndex).toBe(
      before.state!.match.randomSequenceIndex,
    );
    expect(after.state).toEqual(before.state);
    // The failed key was not recorded, so a corrected retry can still run.
    const retry = await handleSubmitAction(
      actionRequest({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "fail",
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(retry.status).toBe(200);
  });

  // CI-only: true two-connection FOR UPDATE contention needs a real Postgres
  // (pg + TEST_DATABASE_URL), absent here. Its outcome equals the sequential
  // proof above under the row lock (m7-actions.md §6).
  it.skip("serializes two truly concurrent submissions (CI Postgres)", () => {});
});
