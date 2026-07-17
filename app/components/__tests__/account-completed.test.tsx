import { render, screen, waitFor } from "@testing-library/react";
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
  it("shows victory when the viewer is the winner, with the reason", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="me"
        completionReason="headquarters_captured"
      />,
    );
    expect(screen.getByText("Victory")).toBeInTheDocument();
    expect(screen.getByText("Headquarters captured")).toBeInTheDocument();
  });

  it("shows defeat when the winner is the opponent", () => {
    render(
      <MatchCompleted
        viewerPlayerId="me"
        winnerPlayerId="them"
        completionReason="timeout_claimed"
      />,
    );
    expect(screen.getByText("Defeat")).toBeInTheDocument();
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
  });
});
