import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateMatchForm } from "../create-match-form";

const MAPS = [
  { id: "map-1", label: "map-1 · 20×16" },
  { id: "map-2", label: "map-2 · 20×16" },
];

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CreateMatchForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits with fog forced off and shows the invitation code", async () => {
    const fetchMock = mockFetch(201, {
      matchId: "m1",
      invitationCode: "ABC123",
      status: "waiting_for_opponent",
    });
    render(<CreateMatchForm maps={MAPS} />);

    await userEvent.selectOptions(screen.getByLabelText("Map"), "map-2");
    await userEvent.selectOptions(screen.getByLabelText("Turn deadline"), "3d");
    await userEvent.click(
      screen.getByRole("button", { name: /create match/i }),
    );

    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      mapId: "map-2",
      settings: { fogEnabled: false, turnDeadline: "3d", dayLimit: null },
    });
  });

  it("surfaces a server error", async () => {
    mockFetch(429, { error: "rate_limited" });
    render(<CreateMatchForm maps={MAPS} />);
    await userEvent.click(
      screen.getByRole("button", { name: /create match/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/rate_limited/),
    );
  });

  it("disables creation when no maps are available (design-blocked)", () => {
    render(<CreateMatchForm maps={[]} />);
    expect(screen.getByText(/no maps are available yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create match/i }),
    ).toBeDisabled();
  });
});
