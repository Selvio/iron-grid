import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateMatchForm, type MapOption } from "../create-match-form";

/** A tiny 2×2 layout — enough to prove the thumbnail draws the right map. */
function mapOption(id: string, terrain: string[][]): MapOption {
  return {
    id,
    label: `${id} · ${terrain[0].length}×${terrain.length}`,
    width: terrain[0].length,
    height: terrain.length,
    terrain,
  };
}

const MAPS: MapOption[] = [
  mapOption("map-1", [
    ["plain", "plain"],
    ["sea", "sea"],
  ]),
  mapOption("map-2", [
    ["forest", "road"],
    ["road", "city"],
  ]),
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

  it("blocks an invalid day limit inline with no request", async () => {
    const fetchMock = mockFetch(201, {
      matchId: "m1",
      invitationCode: "ABC123",
      status: "waiting_for_opponent",
    });
    render(<CreateMatchForm maps={MAPS} />);
    await userEvent.type(screen.getByLabelText(/day limit/i), "0");
    await userEvent.click(
      screen.getByRole("button", { name: /create match/i }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews the default map and follows the selection", async () => {
    render(<CreateMatchForm maps={MAPS} />);
    expect(
      screen.getByRole("img", { name: /Map 1 map preview, 2×2/i }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Map"), "map-2");
    expect(
      screen.getByRole("img", { name: /Map 2 map preview, 2×2/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Map 1 map preview/i }),
    ).not.toBeInTheDocument();
  });

  it("disables creation when no maps are available (design-blocked)", () => {
    render(<CreateMatchForm maps={[]} />);
    expect(screen.getByText(/no maps are available yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /map preview/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /create match/i }),
    ).toBeDisabled();
  });
});
