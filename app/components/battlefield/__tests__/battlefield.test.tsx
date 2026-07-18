import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { Battlefield } from "../battlefield";

// The Phaser bootstrap is mocked: jsdom has no WebGL. The mock invokes the
// onReady callback with a handle so we can assert the in-place reconcile.
const destroy = vi.fn();
const handle = { syncModel: vi.fn(), playAnimation: vi.fn() };
type Data = { terrain: { x: number; y: number; visible: boolean }[] };
const createBattlefieldGame = vi.fn<
  (
    container: HTMLElement,
    data: Data,
    onReady?: (h: typeof handle) => void,
  ) => { destroy: typeof destroy }
>((_container, _data, onReady) => {
  onReady?.(handle);
  return { destroy };
});
vi.mock("../create-game", () => ({ createBattlefieldGame }));

function makeView(): MatchView {
  return {
    map: { width: 2, height: 1, logicalTerrain: [["plain", "forest"]] },
    visibleTiles: [{ x: 0, y: 0 }],
    units: [],
    properties: [],
    unitRender: {},
    you: null,
    opponent: null,
  } as unknown as MatchView;
}
const MATCH_VIEW = makeView();

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

  it("creates the game once and reconciles in place on a view change", async () => {
    const { rerender } = render(<Battlefield matchView={makeView()} />);
    await waitFor(() => expect(createBattlefieldGame).toHaveBeenCalledOnce());

    // A fresh matchView identity must NOT recreate the game — it reconciles.
    rerender(<Battlefield matchView={makeView()} />);
    expect(createBattlefieldGame).toHaveBeenCalledOnce();
    expect(handle.syncModel).toHaveBeenCalledTimes(1);
    expect(handle.syncModel.mock.calls[0]![0]).toMatchObject({
      terrain: expect.any(Array),
    });
  });
});
