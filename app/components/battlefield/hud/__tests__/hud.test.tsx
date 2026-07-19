import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { Hud, type HudUnit } from "../hud";

const NOW = new Date("2026-07-17T12:00:00.000Z").getTime();

function view(overrides: Partial<MatchView> = {}): MatchView {
  return {
    viewerPlayerId: "me",
    activePlayerId: "me",
    currentDay: 3,
    turnDeadlineAt: "2026-07-19T14:00:00.000Z",
    you: { playerId: "me", factionId: "blue", funds: 12000 },
    opponent: { playerId: "them", factionId: "red" },
    ...overrides,
  } as unknown as MatchView;
}

describe("Hud", () => {
  it("shows the day, whose turn, funds and a deadline countdown", () => {
    render(<Hud matchView={view()} nowMs={NOW} />);
    expect(screen.getByText("Day 3")).toBeInTheDocument();
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    // Funds render as a gold coin + the grouped amount (mockup style).
    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("2d 2h")).toBeInTheDocument();
    // The active faction identity is shown (color + insignia).
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("reads the opponent's turn from the active player", () => {
    render(<Hud matchView={view({ activePlayerId: "them" })} nowMs={NOW} />);
    expect(screen.getByText("Opponent's turn")).toBeInTheDocument();
  });

  it("renders the selected-unit panel with HP 0-10, fuel and ammo", () => {
    const unit: HudUnit = {
      typeId: "tank",
      ownerPlayerId: "me",
      trueHp: 55,
      maxHp: 100,
      fuel: 40,
      ammo: 6,
      movementType: "treads",
      movePoints: 5,
      sprite: null,
      terrain: { name: "Plain", defenseStars: 1 },
    };
    render(<Hud matchView={view()} selectedUnit={unit} nowMs={NOW} />);
    expect(screen.getByText("Tank")).toBeInTheDocument();
    // displayHp(55) = ceil(55/10) = 6.
    expect(screen.getByText("6/10")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument(); // fuel
    expect(screen.getByText("6")).toBeInTheDocument(); // ammo
    expect(screen.getByText("5")).toBeInTheDocument(); // move points
    // Faction · movement subtitle + terrain footer.
    expect(screen.getByText(/Blue · Treads/)).toBeInTheDocument();
    expect(screen.getByText("Plain")).toBeInTheDocument();
  });

  it("omits the selected-unit panel when nothing is selected", () => {
    render(<Hud matchView={view()} nowMs={NOW} />);
    expect(screen.queryByText("Tank")).not.toBeInTheDocument();
  });
});
