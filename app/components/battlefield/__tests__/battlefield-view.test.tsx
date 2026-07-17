import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { BattlefieldView } from "../battlefield-view";

// Phaser is mocked — jsdom has no WebGL; the interaction surface is DOM.
vi.mock("../create-game", () => ({
  createBattlefieldGame: vi.fn(() => ({ destroy: vi.fn() })),
}));

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
  // Low fuel keeps the range small so far tiles are unreachable (deselect path).
  fuel: 2,
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
    currentDay: 1,
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

describe("BattlefieldView", () => {
  it("selects an own unit, shows its range and the HUD panel", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    // No unit selected yet.
    expect(screen.queryByText("Tank")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // the tank

    expect(screen.getByText("Tank")).toBeInTheDocument();
    // A reachable neighbor is highlighted.
    expect(screen.getByLabelText("Tile 3, 1").className).toMatch(/bg-primary/);
  });

  it("clears the selection when clicking empty ground", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    expect(screen.getByText("Tank")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tile 0, 3"));
    expect(screen.queryByText("Tank")).not.toBeInTheDocument();
  });

  it("opens the no-undo confirm panel at a chosen destination", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest

    expect(screen.getByText("Confirm move")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    expect(screen.getByText("Move here")).toBeInTheDocument();

    // Cancel steps back to the selected-unit state (range still shown).
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Confirm move")).not.toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();
  });
});
