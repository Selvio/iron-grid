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
    ...overrides,
  };
}

describe("DashboardList", () => {
  it("shows the empty state with a create CTA when there are no matches", () => {
    render(<DashboardList matches={[]} nowMs={NOW} />);
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create match/i })).toHaveAttribute(
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
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.getByText("Waiting on opponent")).toBeInTheDocument();
    expect(screen.getByText("Setting up")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
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
    const section = screen.getByText("Your turn").closest("section")!;
    expect(within(section).getByText("2d 2h")).toBeInTheDocument();
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
});
