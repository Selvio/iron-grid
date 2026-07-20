import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import type { MatchSummary } from "@/app/lib/api-client";
import { DashboardList } from "../dashboard-list";

const NOW = new Date("2026-07-16T12:00:00.000Z").getTime();

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

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
    invitationCode: null,
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
  it("shows the empty state with create and join CTAs when there are no matches", () => {
    render(<DashboardList matches={[]} nowMs={NOW} />);
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new match/i })).toHaveAttribute(
      "href",
      "/matches/new",
    );
    expect(screen.getByRole("link", { name: /join match/i })).toHaveAttribute(
      "href",
      "/matches/join",
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

  it("re-surfaces the host's invitation code with copy actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({ status: "waiting_for_opponent", invitationCode: "ABC234" }),
        ]}
      />,
    );

    expect(screen.getByText("ABC234")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledWith("ABC234");

    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenLastCalledWith(
      `${window.location.origin}/matches/join?code=ABC234`,
    );
    vi.unstubAllGlobals();
  });

  it("does not show an invitation when the seat is already filled", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ status: "commander_selection" })]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /copy code/i }),
    ).not.toBeInTheDocument();
  });

  it("discards a match that never started, after an explicit confirm", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matchId: "xyz", status: "cancelled" }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    refresh.mockClear();
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ matchId: "xyz", status: "waiting_for_opponent" })]}
      />,
    );

    // The first click only asks; nothing is sent until it is confirmed.
    await userEvent.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /discard match/i }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/matches/xyz/cancel");
    expect(init.method).toBe("POST");
    vi.unstubAllGlobals();
  });

  it("backs out of a discard without sending anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DashboardList
        nowMs={NOW}
        matches={[summary({ status: "ready_check" })]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^discard$/i }));
    await userEvent.click(screen.getByRole("button", { name: /keep it/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeVisible();
    vi.unstubAllGlobals();
  });

  it("offers no discard once the match is under way", () => {
    render(
      <DashboardList
        nowMs={NOW}
        matches={[
          summary({ status: "active" }),
          summary({ status: "completed" }),
        ]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
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
