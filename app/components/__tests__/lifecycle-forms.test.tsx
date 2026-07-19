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
    { id: "commander_blue", faction: "blue" as const },
    { id: "commander_red", faction: "red" as const },
  ];

  it("renders placeholder identity — faction badges, no invented names", () => {
    mockFetch(200, {});
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getAllByText("Commander")).toHaveLength(2);
  });

  it("routes to ready check when both have chosen", async () => {
    const fetchMock = mockFetch(200, {
      matchId: "m1",
      status: "ready_check",
      commanderId: "commander_blue",
      factionId: "blue",
    });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Select" })[0]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/matches/m1/ready"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/matches/m1/commander");
  });

  it("shows a waiting state when the opponent has not chosen", async () => {
    mockFetch(200, {
      matchId: "m1",
      status: "commander_selection",
      commanderId: "commander_blue",
      factionId: "blue",
    });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Select" })[0]);
    await waitFor(() =>
      expect(
        screen.getByText(/waiting for your opponent/i),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces a taken-faction conflict (commander_unavailable)", async () => {
    mockFetch(409, { error: "commander_unavailable" });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Select" })[0]);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/faction is taken/i),
    );
  });

  it("shows a generic message for a non-taken error code", async () => {
    mockFetch(500, { error: "server_error" });
    render(<CommanderSelect matchId="m1" commanders={commanders} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Select" })[0]);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong/i,
      ),
    );
  });
});

describe("ReadyCheck", () => {
  it("shows the match-started state and a battlefield link when active", async () => {
    mockFetch(200, { matchId: "m1", status: "active" });
    render(<ReadyCheck matchId="m1" />);
    await userEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    await waitFor(() =>
      expect(screen.getByText(/match has begun/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /enter the battlefield/i }),
    ).toHaveAttribute("href", "/matches/m1/play");
  });

  it("waits for the opponent when only one side is ready", async () => {
    mockFetch(200, { matchId: "m1", status: "ready_check" });
    render(<ReadyCheck matchId="m1" />);
    await userEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/waiting for your opponent/i),
      ).toBeInTheDocument(),
    );
  });
});
