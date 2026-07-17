import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { Battlefield } from "../battlefield";

// The Phaser bootstrap is mocked: jsdom has no WebGL, and the canvas shell holds
// no logic worth asserting here (it is verified manually / in M12).
const destroy = vi.fn();
const createBattlefieldGame = vi.fn<
  (
    container: HTMLElement,
    data: { terrain: { x: number; y: number; visible: boolean }[] },
  ) => { destroy: typeof destroy }
>(() => ({ destroy }));
vi.mock("../create-game", () => ({ createBattlefieldGame }));

const MATCH_VIEW = {
  map: {
    width: 2,
    height: 1,
    logicalTerrain: [["plain", "forest"]],
  },
  visibleTiles: [{ x: 0, y: 0 }],
  units: [],
  unitRender: {},
  you: null,
  opponent: null,
} as unknown as MatchView;

describe("Battlefield", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mounts a labeled canvas host", () => {
    render(<Battlefield matchView={MATCH_VIEW} />);
    const host = screen.getByTestId("battlefield-canvas");
    expect(host).toBeInTheDocument();
    expect(host).toHaveAttribute("aria-label", "Battlefield");
  });

  it("creates the Phaser game in the mount container", async () => {
    render(<Battlefield matchView={MATCH_VIEW} />);
    await waitFor(() => expect(createBattlefieldGame).toHaveBeenCalledOnce());
    const [container, data] = createBattlefieldGame.mock.calls[0];
    expect(container).toBe(screen.getByTestId("battlefield-canvas"));
    // The terrain model is built from the projected view (2 tiles).
    expect(data.terrain).toHaveLength(2);
    expect(data.terrain[0]).toMatchObject({ x: 0, y: 0, visible: true });
    expect(data.terrain[1]).toMatchObject({ x: 1, y: 0, visible: false });
  });

  it("tears the game down on unmount", async () => {
    const { unmount } = render(<Battlefield matchView={MATCH_VIEW} />);
    await waitFor(() => expect(createBattlefieldGame).toHaveBeenCalled());
    unmount();
    expect(destroy).toHaveBeenCalledWith(true);
  });
});
