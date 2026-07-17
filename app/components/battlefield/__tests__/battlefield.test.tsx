import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Battlefield } from "../battlefield";

// The Phaser bootstrap is mocked: jsdom has no WebGL, and the canvas shell holds
// no logic worth asserting here (it is verified manually / in M12).
const destroy = vi.fn();
const createBattlefieldGame = vi.fn(() => ({ destroy }));
vi.mock("../create-game", () => ({ createBattlefieldGame }));

describe("Battlefield", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mounts a labeled canvas host", () => {
    render(<Battlefield />);
    const host = screen.getByTestId("battlefield-canvas");
    expect(host).toBeInTheDocument();
    expect(host).toHaveAttribute("aria-label", "Battlefield");
  });

  it("creates the Phaser game in the mount container", async () => {
    render(<Battlefield />);
    await waitFor(() => expect(createBattlefieldGame).toHaveBeenCalledOnce());
    expect(createBattlefieldGame).toHaveBeenCalledWith(
      screen.getByTestId("battlefield-canvas"),
    );
  });

  it("tears the game down on unmount", async () => {
    const { unmount } = render(<Battlefield />);
    await waitFor(() => expect(createBattlefieldGame).toHaveBeenCalled());
    unmount();
    expect(destroy).toHaveBeenCalledWith(true);
  });
});
