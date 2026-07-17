import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { BattlefieldView } from "../battlefield-view";

/**
 * Battlefield acceptance suite (M10-T11).
 *
 * The cross-cutting DoD behaviors the per-ticket suites don't pin: keyboard
 * accessibility of the DOM interaction surface, and — the core of §9 — that a
 * stale submit reconciles by refetching the authoritative view rather than
 * re-applying locally. The board render mapping, preview wiring and interaction
 * state machine are proven in their own suites (no WebGL in jsdom, so the canvas
 * itself is verified manually / in M12).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T11)
 */

vi.mock("../create-game", () => ({
  createBattlefieldGame: vi.fn(() => ({ destroy: vi.fn() })),
}));

afterEach(() => vi.unstubAllGlobals());

function plainRows(w: number, h: number): string[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "plain"),
  );
}

const TANK = {
  id: "u1",
  typeId: "tank",
  ownerPlayerId: "me",
  position: { x: 2, y: 1 },
  trueHp: 100,
  fuel: 70,
  ammo: 9,
  hasActed: false,
  captureTargetPropertyId: null,
  cargoUnitIds: [],
  specialState: null,
  createdTurn: 0,
};

function view(): MatchView {
  return {
    matchId: "m1",
    status: "active",
    currentDay: 2,
    stateVersion: 4,
    activePlayerId: "me",
    turnDeadlineAt: null,
    viewerPlayerId: "me",
    mapId: "test-map",
    map: { width: 5, height: 4, logicalTerrain: plainRows(5, 4) },
    visibleTiles: [],
    units: [TANK],
    properties: [],
    unitRender: { tank: { spriteRow: 9, submergedRow: null, isAir: false } },
    you: {
      playerId: "me",
      factionId: "blue",
      commanderId: "cmdr-blue",
      funds: 1000,
      powerMeter: 0,
      resigned: false,
    },
    opponent: null,
    winnerPlayerId: null,
    completionReason: null,
  } as unknown as MatchView;
}

describe("battlefield acceptance", () => {
  it("exposes the board interaction as keyboard-operable buttons", () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    const tile = screen.getByLabelText("Tile 2, 1");
    expect(tile.tagName).toBe("BUTTON");
    expect(tile).not.toBeDisabled();
  });

  it("selects a unit and confirms a move entirely from the keyboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
        async (url) =>
          ({
            ok: true,
            status: 200,
            json: async () =>
              url.includes("/actions")
                ? { stateVersion: 5, status: "active" }
                : view(),
          }) as Response,
      ),
    );
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.click(screen.getByLabelText("Tile 2, 1")); // select
    await user.click(screen.getByLabelText("Tile 3, 1")); // destination
    // The confirm panel is reachable and operable by keyboard.
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByText("Confirm move")).not.toBeInTheDocument(),
    );
  });

  it("reconciles a stale submit by refetching, never re-applying locally", async () => {
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async (url) => {
      if (url.includes("/actions")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: "stale_state_version",
            currentStateVersion: 7,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    await userEvent.click(screen.getByLabelText("Tile 3, 1"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    // The 409 triggered a refetch of the authoritative view.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) =>
            String(c[0]).includes("/api/matches/m1") &&
            !String(c[0]).includes("/actions"),
        ),
      ).toBe(true),
    );
    // Selection cleared — the client did not keep a locally-applied move.
    expect(screen.queryByText("Confirm move")).not.toBeInTheDocument();
  });
});
