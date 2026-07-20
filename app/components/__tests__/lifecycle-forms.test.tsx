import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommanderSelect } from "../commander-select";
import { JoinForm } from "../join-form";
import { ReadyCheck } from "../ready-check";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JoinForm", () => {
  it("joins with the code and routes to commander selection", async () => {
    const fetchMock = mockFetch(200, {
      matchId: "m1",
      status: "commander_selection",
    });
    render(<JoinForm matchId="m1" defaultCode="ABC234" />);
    await userEvent.click(screen.getByRole("button", { name: /join match/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/matches/m1/commander"),
    );
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/matches/m1/join");
    expect(JSON.parse(init.body)).toEqual({ code: "ABC234" });
  });

  it("joins by code alone when no match id is provided", async () => {
    const fetchMock = mockFetch(200, {
      matchId: "m2",
      status: "commander_selection",
    });
    render(<JoinForm defaultCode="ABC234" />);
    await userEvent.click(screen.getByRole("button", { name: /join match/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/matches/m2/commander"),
    );
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/matches/join");
    expect(JSON.parse(init.body)).toEqual({ code: "ABC234" });
  });

  it("surfaces an invalid-invitation error", async () => {
    mockFetch(404, { error: "not_found" });
    render(<JoinForm matchId="m1" defaultCode="ZZZ999" />);
    await userEvent.click(screen.getByRole("button", { name: /join match/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not valid/i),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("blocks a malformed code with an inline error and no request", async () => {
    const fetchMock = mockFetch(200, {});
    render(<JoinForm matchId="m1" defaultCode="short" />);
    await userEvent.click(screen.getByRole("button", { name: /join match/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/6-character/i),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("CommanderSelect", () => {
  const commanders = [
    {
      id: "commander_blue",
      faction: "blue" as const,
      passive: { name: "Spearhead", description: "Vehicles attack at 115%." },
    },
    {
      id: "commander_red",
      faction: "red" as const,
      passive: { name: "Barrage", description: "Indirects attack at 120%." },
    },
  ];

  /** Pick a card, then confirm — the design's two-step lock-in. */
  async function pickAndLockIn(faction: "Blue" | "Red") {
    await userEvent.click(
      screen.getByRole("button", { name: `Commander — ${faction}` }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /lock in commander/i }),
    );
  }

  it("renders placeholder identity — faction badges, no invented names", () => {
    mockFetch(200, {});
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    expect(
      screen.getByRole("button", { name: "Commander — Blue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Commander — Red" }),
    ).toBeInTheDocument();
    // The visible identity is the colour word plus its insignia (§27.4).
    expect(screen.getAllByText("Blue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Commander")).toHaveLength(2);
    // The approved passive is shown (ADR-0006); the power is still blocked, so
    // only its panel says so — one line per card, never an invented power.
    expect(screen.getByText("Spearhead")).toBeInTheDocument();
    expect(screen.getByText("Barrage")).toBeInTheDocument();
    expect(screen.getAllByText(/still being designed/i)).toHaveLength(2);
  });

  it("says so instead of inventing a trait when a passive is unresolved", () => {
    mockFetch(200, {});
    render(
      <CommanderSelect
        matchId="m1"
        commanders={[
          { id: "commander_blue", faction: "blue" as const, passive: null },
        ]}
      />,
    );
    // Both panels — passive and power — fall back to the honest placeholder.
    expect(screen.getAllByText(/still being designed/i)).toHaveLength(2);
  });

  it("only highlights on pick — nothing is sent until it is locked in", async () => {
    const fetchMock = mockFetch(200, {});
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    const lockIn = screen.getByRole("button", { name: /lock in commander/i });
    expect(lockIn).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Commander — Blue" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Commander — Blue" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /lock in commander — blue/i }),
    ).toBeEnabled();
  });

  it("routes to ready check when both have chosen", async () => {
    const fetchMock = mockFetch(200, {
      matchId: "m1",
      status: "ready_check",
      commanderId: "commander_blue",
      factionId: "blue",
    });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await pickAndLockIn("Blue");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/matches/m1/ready"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/matches/m1/commander");
  });

  it("routes to ready check even when the opponent has not chosen", async () => {
    mockFetch(200, {
      matchId: "m1",
      status: "commander_selection",
      commanderId: "commander_blue",
      factionId: "blue",
    });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await pickAndLockIn("Blue");
    // The choice is final either way — the ready check owns the waiting state.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/matches/m1/ready"));
  });

  it("disables a faction the opponent already holds", async () => {
    const fetchMock = mockFetch(200, {});
    render(
      <CommanderSelect
        matchId="m1"
        commanders={commanders}
        takenFactions={["red"]}
      />,
    );
    const taken = screen.getByRole("button", {
      name: "Commander — Red (taken)",
    });
    expect(taken).toBeDisabled();
    await userEvent.click(taken);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /lock in commander/i }),
    ).toBeDisabled();
    // Blue is untouched and still selectable.
    expect(
      screen.getByRole("button", { name: "Commander — Blue" }),
    ).toBeEnabled();
  });

  it("surfaces a taken-faction conflict (commander_unavailable)", async () => {
    mockFetch(409, { error: "commander_unavailable" });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await pickAndLockIn("Blue");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/faction is taken/i),
    );
  });

  it("shows a generic message for a non-taken error code", async () => {
    mockFetch(500, { error: "server_error" });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await pickAndLockIn("Blue");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong/i,
      ),
    );
  });
});

describe("ReadyCheck", () => {
  const seats = [
    {
      playerId: "p1",
      faction: "blue" as const,
      isReady: false,
      isViewer: true,
    },
    {
      playerId: "p2",
      faction: "red" as const,
      isReady: false,
      isViewer: false,
    },
  ];

  it("shows the match-started state and a battlefield link when active", async () => {
    mockFetch(200, { matchId: "m1", status: "active" });
    render(<ReadyCheck matchId="m1" seats={seats} />);
    await userEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    await waitFor(() =>
      expect(screen.getByText(/match has begun/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /enter the battlefield/i }),
    ).toHaveAttribute("href", "/matches/m1/play");
    // Both seats flip to ready once the server reports activation.
    expect(screen.getAllByText("Ready")).toHaveLength(2);
  });

  it("waits for the opponent when only one side is ready", async () => {
    mockFetch(200, { matchId: "m1", status: "ready_check" });
    render(<ReadyCheck matchId="m1" seats={seats} />);
    await userEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/waiting for your opponent to confirm/i),
      ).toBeInTheDocument(),
    );
    // Only the caller's own seat is known to have changed.
    expect(screen.getAllByText("Ready")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /you are ready/i }),
    ).toBeDisabled();
  });

  it("renders each seat with its faction insignia and marks the caller", () => {
    render(
      <ReadyCheck
        matchId="m1"
        seats={seats}
        summary={{
          mapName: "Spann Island",
          turnLength: "3-day",
          fogEnabled: false,
        }}
      />,
    );
    expect(screen.getByText(/commander — blue/i)).toBeInTheDocument();
    expect(screen.getByText(/commander — red/i)).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(
      screen.getByText(/spann island · 3-day turns · fog of war off/i),
    ).toBeInTheDocument();
  });

  it("holds the ready button while the opponent is still choosing", () => {
    render(
      <ReadyCheck
        matchId="m1"
        seats={[seats[0], { ...seats[1], faction: null }]}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: /waiting for your opponent's commander/i,
      }),
    ).toBeDisabled();
    expect(screen.getByText(/choosing a commander/i)).toBeInTheDocument();
  });

  it("offers the battlefield on load when the match already activated", () => {
    // The opponent confirmed last while the player was away: the caller's own
    // ready flag reads the same as "waiting", so the status decides.
    render(
      <ReadyCheck
        matchId="m1"
        isActive
        seats={seats.map((seat) => ({ ...seat, isReady: true }))}
      />,
    );
    expect(screen.getByText(/match has begun/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /enter the battlefield/i }),
    ).toHaveAttribute("href", "/matches/m1/play");
  });

  it("starts in the confirmed state when the caller already readied up", () => {
    render(
      <ReadyCheck
        matchId="m1"
        seats={[{ ...seats[0], isReady: true }, seats[1]]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /you are ready/i }),
    ).toBeDisabled();
  });
});
