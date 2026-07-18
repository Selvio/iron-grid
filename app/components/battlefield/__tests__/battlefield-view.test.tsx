import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameData } from "game-data";
import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { BattlefieldView } from "../battlefield-view";

// The Phaser board is mocked to a stub that surfaces a scene handle via
// onSceneReady — jsdom has no WebGL; the interaction surface is DOM.
const scene = vi.hoisted(() => ({
  playAnimation: vi.fn(() => Promise.resolve()),
  syncModel: vi.fn(),
}));
vi.mock("../battlefield", () => ({
  Battlefield: ({
    onSceneReady,
  }: {
    onSceneReady?: (handle: typeof scene) => void;
  }) => {
    onSceneReady?.(scene);
    return null;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  scene.playAnimation.mockClear();
  scene.syncModel.mockClear();
});

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
  // Low fuel keeps the range small so far tiles are unreachable (deselect path).
  fuel: 2,
  ammo: 9,
  hasActed: false,
  captureTargetPropertyId: null,
  cargoUnitIds: [],
  specialState: null,
  createdTurn: 0,
};

function view(
  units: unknown[] = [TANK],
  properties: unknown[] = [],
): MatchView {
  return {
    matchId: "m1",
    status: "active",
    currentDay: 1,
    stateVersion: 4,
    activePlayerId: "me",
    turnDeadlineAt: null,
    viewerPlayerId: "me",
    mapId: "test-map",
    map: { width: 5, height: 4, logicalTerrain: plainRows(5, 4) },
    visibleTiles: [],
    units,
    properties,
    unitRender: { tank: { spriteRow: 9, submergedRow: null, isAir: false } },
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

/** Stubs `fetch` so `/actions` returns a version bump and any GET returns `v`. */
function stubFetch(v: MatchView) {
  const fetchMock = vi.fn<
    (url: string, init?: RequestInit) => Promise<Response>
  >(
    async (url) =>
      ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes("/actions") ? { stateVersion: 5, status: "active" } : v,
      }) as Response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("BattlefieldView", () => {
  it("selects an own unit, shows its range and the HUD panel", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);

    expect(screen.queryByText("Tank")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // the tank

    expect(screen.getByText("Tank")).toBeInTheDocument();
    // A reachable neighbor is highlighted.
    expect(screen.getByLabelText("Tile 3, 1").className).toMatch(/bg-primary/);
  });

  it("clears the selection when clicking empty ground", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    expect(screen.getByText("Tank")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tile 0, 3"));
    expect(screen.queryByText("Tank")).not.toBeInTheDocument();
  });

  it("opens the no-undo action menu at a chosen destination", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest

    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wait" })).toBeInTheDocument();

    // Cancel steps back to the selected-unit state (range still shown).
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();
  });

  it("ends the turn, submitting an end_turn action then refetching", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByRole("button", { name: /end turn/i }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({ type: "end_turn", expectedStateVersion: 4 });
    });
  });

  it("walks the moved unit (with its path) before reconciling", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest
    await userEvent.click(screen.getByRole("button", { name: "Wait" }));

    await waitFor(() => expect(scene.playAnimation).toHaveBeenCalledOnce());
    expect(scene.playAnimation).toHaveBeenCalledWith([
      {
        kind: "move",
        unitId: "u1",
        path: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
        ],
      },
    ]);
    // The walk runs BEFORE the reconcile refetch (GET the match).
    const refetchCall = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/matches/m1") &&
        !String(c[0]).includes("/actions"),
    );
    expect(refetchCall).toBeDefined();
    expect(scene.playAnimation.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.length - 1]!,
    );
  });

  it("skips the walk (empty plan) under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
    }));
    stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    await userEvent.click(screen.getByLabelText("Tile 3, 1"));
    await userEvent.click(screen.getByRole("button", { name: "Wait" }));

    await waitFor(() => expect(scene.playAnimation).toHaveBeenCalledOnce());
    expect(scene.playAnimation).toHaveBeenCalledWith([]); // no walk
  });

  it("submits move_and_wait on Wait, then refetches the authoritative view", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest
    await userEvent.click(screen.getByRole("button", { name: "Wait" }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({
        type: "move_and_wait",
        unitId: "u1",
        expectedStateVersion: 4,
      });
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) =>
            String(c[0]).includes("/api/matches/m1") &&
            !String(c[0]).includes("/actions"),
        ),
      ).toBe(true),
    );
  });
});

// --- Combat & capture: driven with real weapons/damage tables ------------------

/** A tiny combat-capable game data: direct 1-range units + a damage chart. */
function combatGameData(): GameData {
  const move = {
    type: "treads",
    points: 6,
    can_move_and_attack: true,
    can_move_and_capture: false,
  };
  const combat = { type: "direct", min_range: 1, max_range: 1 };
  return {
    version: "1.0.0",
    units: {
      tank: {
        category: "ground",
        movement: move,
        combat,
        capabilities: { can_capture: false },
        logistics: { primary_ammo_per_attack: 1 },
        rendering: { sprite_row: 9, row_id: "unit_r09" },
      },
      infantry: {
        category: "ground",
        movement: {
          ...move,
          type: "foot",
          points: 3,
          can_move_and_capture: true,
        },
        combat,
        capabilities: { can_capture: true },
        logistics: { primary_ammo_per_attack: 0 },
        rendering: { sprite_row: 0, row_id: "unit_r00" },
      },
    },
    properties: { city: { capturable: true, max_capture_points: 20 } },
    damageChart: {
      attackers: {
        tank: {
          matchups: {
            tank: {
              weapon_values: {
                primary: { weapon_id: "cannon", base_damage: 55 },
              },
            },
          },
        },
      },
    },
    terrain: {
      plain: {
        movement_costs: {
          foot: 1,
          mech: 1,
          tires: 1,
          treads: 1,
          air: 1,
          ship: null,
          transport_ship: null,
        },
      },
    },
    maps: {
      "test-map": {
        id: "test-map",
        dimensions: { width: 5, height: 4 },
        logical_terrain: plainRows(5, 4),
      },
    },
  } as unknown as GameData;
}

describe("BattlefieldView · combat", () => {
  const MY_TANK = { ...TANK, fuel: 70 };
  const ENEMY_TANK = {
    ...TANK,
    id: "e1",
    ownerPlayerId: "foe",
    position: { x: 3, y: 1 },
  };

  it("picks Attack against an adjacent enemy → forecast → submits an attack", async () => {
    const v = view([MY_TANK, ENEMY_TANK]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select my tank
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Attack" })); // menu
    // A single target jumps straight to the forecast; confirm with Attack.
    expect(screen.getByText("Combat")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({
        type: "attack",
        unitId: "u1",
        targetUnitId: "e1",
        expectedStateVersion: 4,
      });
    });
    // The attack beat plays on the defender before reconciling.
    await waitFor(() => expect(scene.playAnimation).toHaveBeenCalledOnce());
    expect(scene.playAnimation).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "attack", defenderUnitId: "e1" }),
    ]);
  });

  it("highlights the attackable enemy tile during target select", async () => {
    // Two enemies flanking the tank force the explicit target picker.
    const west = { ...ENEMY_TANK, id: "e2", position: { x: 1, y: 1 } };
    const v = view([MY_TANK, ENEMY_TANK, west]);
    stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));

    expect(screen.getByText("Choose target")).toBeInTheDocument();
    expect(screen.getByLabelText("Tile 3, 1").className).toMatch(/destructive/);
    expect(screen.getByLabelText("Tile 1, 1").className).toMatch(/destructive/);
  });

  it("captures an enemy property in place", async () => {
    const infantry = {
      ...TANK,
      id: "i1",
      typeId: "infantry",
      ammo: 0,
      fuel: 99,
      position: { x: 2, y: 1 },
    };
    const city = {
      id: "c1",
      typeId: "city",
      position: { x: 2, y: 1 },
      ownerPlayerId: "foe",
      capturePointsRemaining: 20,
      capturingUnitId: null,
    };
    const v = view([infantry], [city]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select infantry
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({
        type: "capture",
        unitId: "i1",
        expectedStateVersion: 4,
      });
    });
  });
});
