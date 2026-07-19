import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MatchSummary } from "@/app/lib/api-client";
import { DashboardList } from "../dashboard-list";

const NOW = new Date("2026-07-16T12:00:00.000Z").getTime();

function summary(overrides: Partial<MatchSummary>): MatchSummary {
  return {
    matchId: "m",
    status: "active",
    role: "host",
    viewerPlayerId: "me",
    activePlayerId: "me",
    turnDeadlineAt: null,
    mapId: "spann-island",
    day: 0,
    opponent: null,
    ...overrides,
  };
}

const MAP_PREVIEWS = {
  "spann-island": {
    id: "spann-island",
    width: 20,
    height: 16,
    terrain: [["plain"]],
  },
};

describe("DashboardList", () => {
  it("shows the empty state with a create CTA when there are no matches", () => {
    render(<DashboardList matches={[]} nowMs={NOW} />);
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new match/i })).toHaveAttribute(
      "href",
      "/matches/new",
    );
  });

  it("groups by whose turn it is", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({ matchId: "a", activePlayerId: "me" }),
          summary({ matchId: "b", activePlayerId: "them" }),
          summary({ matchId: "c", status: "commander_selection" }),
          summary({ matchId: "d", status: "completed" }),
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /your turn — act now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /waiting on opponent/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /setting up/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /finished/i }),
    ).toBeInTheDocument();
  });

  it("renders a deadline countdown for an active turn", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({
            matchId: "a",
            activePlayerId: "me",
            turnDeadlineAt: "2026-07-18T14:00:00.000Z",
          }),
        ]}
      />,
    );
    const section = screen
      .getByRole("heading", { name: /your turn — act now/i })
      .closest("section")!;
    expect(within(section).getByText("Deadline")).toBeInTheDocument();
    expect(within(section).getByText("2d 2h")).toBeInTheDocument();
  });

  it("labels the opponent's countdown as theirs", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({
            activePlayerId: "them",
            turnDeadlineAt: "2026-07-18T14:00:00.000Z",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Their deadline")).toBeInTheDocument();
  });

  it("titles a row with the map name, its size and the day counter", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ day: 7 })]}
        mapPreviews={MAP_PREVIEWS}
      />,
    );
    expect(screen.getByText("Spann Island")).toBeInTheDocument();
    expect(screen.getByText("Day 7")).toBeInTheDocument();
    expect(screen.getByText("20×16")).toBeInTheDocument();
  });

  it("omits the day counter before the match starts", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ status: "commander_selection", day: 0 })]}
      />,
    );
    expect(screen.queryByText(/^Day /)).not.toBeInTheDocument();
  });

  it("shows the opponent by name with a non-color-only faction insignia", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ opponent: { name: "Ada", factionId: "red" } })]}
      />,
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    // The insignia carries a text label for screen readers (§27.4).
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("falls back to a neutral opponent label when they have no name", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ opponent: { name: null, factionId: null } })]}
      />,
    );
    expect(screen.getByText("Opponent")).toBeInTheDocument();
  });

  it("says so when the second seat is still empty", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ status: "waiting_for_opponent", opponent: null })]}
      />,
    );
    expect(screen.getByText("No opponent yet")).toBeInTheDocument();
  });

  it("marks only the caller's own turn with the 'Your turn' pill", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({ matchId: "a", activePlayerId: "me" }),
          summary({ matchId: "b", activePlayerId: "them" }),
        ]}
      />,
    );
    expect(screen.getAllByText("Your turn")).toHaveLength(1);
    expect(screen.getByText("In play")).toBeInTheDocument();
  });

  it("links a commander-selection match to its screen", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ matchId: "xyz", status: "commander_selection" })]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /choosing commanders/i }),
    ).toHaveAttribute("href", "/matches/xyz/commander");
  });

  it("links an active match to the battlefield play screen", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ matchId: "xyz", status: "active" })]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /your turn|in play/i }),
    ).toHaveAttribute("href", "/matches/xyz/play");
  });
});
