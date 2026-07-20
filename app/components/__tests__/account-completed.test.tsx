import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationPreferences } from "@/app/lib/api-client";
import { MatchCompleted } from "../match-completed";
import { NotificationPreferencesForm } from "../notification-preferences";

const PREFS: NotificationPreferences = {
  match_invitation: true,
  turn_started: true,
  turn_reminder: true,
  turn_expired: false,
  match_completed: true,
};

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotificationPreferencesForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the five triggers from the initial preferences", () => {
    mockFetch(200, PREFS);
    render(<NotificationPreferencesForm initial={PREFS} />);
    expect(screen.getByLabelText("Match invitations")).toBeChecked();
    expect(screen.getByLabelText("Turn deadline passed")).not.toBeChecked();
  });

  it("patches a toggled key and lets the server value win over the optimistic one", async () => {
    // The user turns turn_expired ON, but the server answers that it is still
    // OFF — the reconcile must show the SERVER value, not the optimistic click.
    const fetchMock = mockFetch(200, { ...PREFS, turn_expired: false });
    render(<NotificationPreferencesForm initial={PREFS} />);
    await userEvent.click(screen.getByLabelText("Turn deadline passed"));

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/me/notifications");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ turn_expired: true });
    // Server said false → the toggle reconciles back to unchecked.
    await waitFor(() =>
      expect(screen.getByLabelText("Turn deadline passed")).not.toBeChecked(),
    );
  });

  it("reverts and surfaces an error when the patch fails", async () => {
    mockFetch(500, { error: "server_error" });
    render(<NotificationPreferencesForm initial={PREFS} />);
    await userEvent.click(screen.getByLabelText("Match invitations"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not save/i),
    );
    // Reverted to the original checked state.
    expect(screen.getByLabelText("Match invitations")).toBeChecked();
  });
});

describe("MatchCompleted", () => {
  const seats = [
    {
      playerId: "me",
      faction: "blue" as const,
      label: "Ada",
      isViewer: true,
      isWinner: true,
      unitsLost: 3,
      damageDealt: 41200,
      captures: 9,
      unitsBuilt: 22,
    },
    {
      playerId: "them",
      faction: "red" as const,
      // No display name on a magic-link account: the email identifies them.
      label: "rival@example.edu",
      isViewer: false,
      isWinner: false,
      unitsLost: 17,
      damageDealt: 28600,
      captures: 4,
      unitsBuilt: 19,
    },
  ];

  it("shows victory when the viewer is the winner, with the reason", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="me"
        completionReason="headquarters_captured"
      />,
    );
    expect(screen.getByText("VICTORY")).toBeInTheDocument();
    expect(screen.getByText("Enemy HQ captured")).toBeInTheDocument();
  });

  it("shows defeat when the winner is the opponent", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="them"
        completionReason="timeout_claimed"
      />,
    );
    expect(screen.getByText("DEFEAT")).toBeInTheDocument();
    expect(screen.getByText("Turn deadline expired")).toBeInTheDocument();
  });

  it("shows a neutral end when there is no winner", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId={null}
        completionReason="administrative"
      />,
    );
    expect(screen.getByText("Match ended")).toBeInTheDocument();
    expect(screen.getByText("BATTLE RESULTS")).toBeInTheDocument();
  });

  it("names the winning army by faction and stamps the match chips", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="me"
        completionReason="army_eliminated"
        seats={seats}
        summary={{ mapName: "Rainy Haven", day: 11, duration: "42 min" }}
      />,
    );
    expect(screen.getByText("Blue Army wins")).toBeInTheDocument();
    expect(screen.getByText("Rainy Haven")).toBeInTheDocument();
    expect(screen.getByText("Day 11 · 42 min")).toBeInTheDocument();
  });

  it("tabulates what each side did, winner first and the viewer marked", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="me"
        completionReason="army_eliminated"
        seats={seats}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Commander — Blue");
    expect(rows[0]).toHaveTextContent("Winner");
    expect(rows[0]).toHaveTextContent("(you)");
    // Thousands are grouped, as the design shows them.
    expect(within(rows[0]).getByText("41,200")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Ada");
    // Who you actually played, not just which colour they held.
    expect(rows[1]).toHaveTextContent("rival@example.edu");
    expect(rows[1]).toHaveTextContent("Defeated");
    expect(within(rows[1]).getByText("17")).toBeInTheDocument();
  });

  it("shows no score or rank — those weights are still an open blocker", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="me"
        completionReason="army_eliminated"
        seats={seats}
        summary={{ mapName: "Rainy Haven", day: 11, duration: null }}
      />,
    );
    // The mockup's SPEED / POWER / TECHNIQUE cards and its rank letter are not
    // rendered: §23.4 / §33.2 leave the weights undecided (see the component).
    expect(screen.queryByText(/speed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/technique/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rank/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument();
  });
});
