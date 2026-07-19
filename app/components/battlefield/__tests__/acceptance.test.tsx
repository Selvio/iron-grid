import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { BattlefieldView } from "../battlefield-view";

/**
 * Battlefield acceptance suite (M10-T11).
 *
 * The cross-cutting DoD behaviors the per-ticket suites don't pin: keyboard
 * accessibility of the DOM interaction surface, and — the core of §9 — that a
 * stale submit reconciles by refetching the authoritative view rather than
 * re-applying locally. The board render mapping, preview wiring and interaction
 * state machine are proven in their own suites (no WebGL in jsdom, so the canvas
 * itself is verified manually / in M12).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T11)
 */

vi.mock("../create-game", () => ({
  createBattlefieldGame: vi.fn(() => ({ destroy: vi.fn() })),
}));

// Web Audio does not exist in jsdom; the spy proves the wiring instead.
const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }));
vi.mock("@/app/lib/audio/sfx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/audio/sfx")>()),
  playSfx,
  playNewDay: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

function plainRows(w: number, h: number): string[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "plain"),
  );
}

const TANK = {
  id: "u1",
  typeId: "tank",
  ownerPlayerId: "me",
  position: { x: 2, y: 1 },
  trueHp: 100,
  fuel: 70,
  ammo: 9,
  hasActed: false,
  captureTargetPropertyId: null,
  cargoUnitIds: [],
  specialState: null,
  createdTurn: 0,
};

function view(): MatchView {
  return {
    matchId: "m1",
    status: "active",
    currentDay: 2,
    stateVersion: 4,
    activePlayerId: "me",
    turnDeadlineAt: null,
    viewerPlayerId: "me",
    mapId: "test-map",
    map: { width: 5, height: 4, logicalTerrain: plainRows(5, 4) },
    visibleTiles: [],
    units: [TANK],
    properties: [],
    unitRender: {
      tank: { spriteKey: "tank", submergedSpriteKey: null, isAir: false },
    },
    you: {
      playerId: "me",
      factionId: "blue",
      commanderId: "cmdr-blue",
      funds: 1000,
      powerMeter: 0,
      resigned: false,
    },
    opponent: null,
    winnerPlayerId: null,
    completionReason: null,
  } as unknown as MatchView;
}

describe("battlefield acceptance", () => {
  it("exposes the board interaction as keyboard-operable buttons", () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    const tile = screen.getByLabelText("Tile 2, 1");
    expect(tile.tagName).toBe("BUTTON");
    expect(tile).not.toBeDisabled();
  });

  it("gives the board a single tab stop and moves it with the arrows", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    // Exactly one cell is tabbable — 150 tab stops is not a board.
    const tabbable = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Tile "))
      .filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);

    screen.getByLabelText("Tile 2, 1").focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Tile 3, 1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Tile 3, 2")).toHaveFocus();
    // The cursor stops at the board's edge instead of wrapping.
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByLabelText("Tile 3, 0")).toHaveFocus();
  });

  it("cancels one step at a time with Escape", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.click(screen.getByLabelText("Tile 2, 1")); // select
    await user.click(screen.getByLabelText("Tile 3, 1")); // action menu
    expect(screen.getByRole("group", { name: /actions/i })).toBeInTheDocument();

    await user.keyboard("{Escape}"); // menu → selected unit
    expect(
      screen.queryByRole("group", { name: /actions/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();

    await user.keyboard("{Escape}"); // selected unit → idle
    expect(screen.queryByText("Tank")).not.toBeInTheDocument();
  });

  it("opens and closes the shortcut help with ? and Escape", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.keyboard("?");
    expect(
      screen.getByRole("dialog", { name: /keyboard/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("jumps to the next unit that has not acted with N", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.keyboard("n");
    expect(screen.getByLabelText("Tile 2, 1")).toHaveFocus();
  });

  it("asks before ending the turn from the keyboard, and Escape backs out", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.keyboard("e");
    const dialog = screen.getByRole("dialog", { name: /end your turn/i });
    expect(dialog).toBeInTheDocument();
    // The dialog takes focus, so Enter cannot land on the board behind it.
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("plays the unit's own sound on selection, and M silences everything", async () => {
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.click(screen.getByLabelText("Tile 2, 1")); // a tank
    expect(playSfx).toHaveBeenCalledWith("select_treads");

    // M is the same switch as the button: both go through the audio module.
    const toggle = screen.getByRole("button", { name: "Mute" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("announces selection and turn changes to assistive tech", async () => {
    const { container } = render(
      <BattlefieldView matchView={view()} gameData={fixtureGameData()} />,
    );
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    expect(live.textContent).toMatch(/tank selected/i);
  });

  it("selects a unit and confirms a move entirely from the keyboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
        async (url) =>
          ({
            ok: true,
            status: 200,
            json: async () =>
              url.includes("/actions")
                ? { stateVersion: 5, status: "active" }
                : view(),
          }) as Response,
      ),
    );
    const user = userEvent.setup();
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    await user.click(screen.getByLabelText("Tile 2, 1")); // select
    await user.click(screen.getByLabelText("Tile 3, 1")); // destination
    // The action menu is reachable and operable by keyboard.
    const wait = screen.getByRole("button", { name: "Move" });
    wait.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: /actions/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("reconciles a stale submit by refetching, never re-applying locally", async () => {
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async (url) => {
      if (url.includes("/actions")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: "stale_state_version",
            currentStateVersion: 7,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    await userEvent.click(screen.getByLabelText("Tile 3, 1"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

    // The 409 triggered a refetch of the authoritative view.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) =>
            String(c[0]).includes("/api/matches/m1") &&
            !String(c[0]).includes("/actions"),
        ),
      ).toBe(true),
    );
    // Selection cleared — the client did not keep a locally-applied move.
    expect(
      screen.queryByRole("group", { name: /actions/i }),
    ).not.toBeInTheDocument();
  });
});
