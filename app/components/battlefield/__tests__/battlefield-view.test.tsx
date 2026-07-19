import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("zooms the board in and out with the ± control", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    expect(screen.getByText("100%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("110%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("opens the no-undo action menu at a chosen destination", async () => {
    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest

    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();

    // Cancel steps back to the selected-unit state (range still shown).
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();
  });

  it("confirms Move when re-clicking the chosen destination tile", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // open menu
    expect(screen.getByText("Actions")).toBeInTheDocument();

    // Re-click the same destination — commits move_and_wait (no Move button).
    await userEvent.click(screen.getByLabelText("Tile 3, 1"));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({ type: "move_and_wait", unitId: "u1" });
    });
  });

  it("confirms end turn through the dialog, then submits + refetches", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    // The board button opens a no-undo confirmation dialog.
    await userEvent.click(screen.getByRole("button", { name: /end turn/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("End your turn?")).toBeInTheDocument();
    // Confirm from inside the dialog.
    await userEvent.click(
      within(dialog).getByRole("button", { name: /end turn/i }),
    );

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

  it("does not end the turn when the dialog is dismissed with Not yet", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByRole("button", { name: /end turn/i }));
    await userEvent.click(screen.getByRole("button", { name: "Not yet" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("/actions")),
    ).toBe(false);
  });

  it("walks the moved unit (with its path) before reconciling", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(scene.playAnimation).toHaveBeenCalledOnce());
    expect(scene.playAnimation).toHaveBeenCalledWith([]); // no walk
  });

  it("submits move_and_wait on Move, then refetches the authoritative view", async () => {
    const fetchMock = stubFetch(view());

    render(<BattlefieldView matchView={view()} gameData={fixtureGameData()} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // reachable dest
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

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
        cost: 7000,
        enabled_in_mvp: true,
        display_name: "Tank",
        movement: move,
        combat,
        capabilities: { can_capture: false },
        logistics: { primary_ammo_per_attack: 1 },
        rendering: { sprite_key: "tank" },
      },
      infantry: {
        category: "ground",
        cost: 1000,
        enabled_in_mvp: true,
        display_name: "Infantry",
        movement: {
          ...move,
          type: "foot",
          points: 3,
          can_move_and_capture: true,
          can_move_and_join: true,
          can_move_and_load: true,
        },
        combat,
        capabilities: { can_capture: true },
        logistics: { primary_ammo_per_attack: 0 },
        rendering: { sprite_key: "infantry" },
      },
      apc: {
        category: "ground",
        cost: 5000,
        enabled_in_mvp: true,
        display_name: "APC",
        movement: { ...move },
        capabilities: { can_supply: true, can_transport: true },
        transport: { capacity: 1, allowed_cargo: ["infantry"] },
        rendering: { sprite_key: "apc" },
      },
      submarine: {
        category: "naval",
        cost: 20000,
        enabled_in_mvp: true,
        display_name: "Submarine",
        movement: { type: "ship", points: 5 },
        combat,
        capabilities: { can_dive: true },
        logistics: { primary_ammo_per_attack: 1 },
        rendering: { sprite_key: "submarine" },
      },
    },
    properties: {
      city: { capturable: true, max_capture_points: 20 },
      base: {
        capturable: true,
        max_capture_points: 20,
        production: {
          category: "ground",
          allowed_unit_ids: ["infantry", "tank"],
        },
      },
    },
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
        display_name: "Plain",
        defense_stars: 1,
        group: "land",
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
    // The chosen target keeps its reticle and the forecast reads as a percentage.
    expect(
      screen.getByLabelText("Tile 3, 1").querySelector("[data-reticle]"),
    ).not.toBeNull();
    expect(screen.getAllByText(/%$/).length).toBeGreaterThan(0);
    // The forecast shows the defender's HP transition and terrain defense.
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.getByText(/10 →/)).toBeInTheDocument();
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

  it("appends a death beat when the forecast guarantees the kill", async () => {
    // A near-dead defender: even the luck-0 forecast wipes it, so the plan may
    // safely play the death clip before the refetch confirms the removal.
    const doomed = { ...ENEMY_TANK, trueHp: 5 };
    const v = view([MY_TANK, doomed]);
    stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select my tank
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));

    await waitFor(() => expect(scene.playAnimation).toHaveBeenCalledOnce());
    expect(scene.playAnimation).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "attack", defenderUnitId: "e1" }),
      expect.objectContaining({ kind: "destroy", unitId: "e1" }),
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
    // Both attackable enemies show a reticle to pick from.
    expect(
      screen.getByLabelText("Tile 3, 1").querySelector("[data-reticle]"),
    ).not.toBeNull();
    expect(
      screen.getByLabelText("Tile 1, 1").querySelector("[data-reticle]"),
    ).not.toBeNull();
  });

  it("picks one of several targets by clicking its reticle → forecast → attack", async () => {
    const west = { ...ENEMY_TANK, id: "e2", position: { x: 1, y: 1 } };
    const v = view([MY_TANK, ENEMY_TANK, west]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    // Choose the western enemy specifically.
    await userEvent.click(screen.getByLabelText("Tile 1, 1"));

    expect(screen.getByText("Combat")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      expect(
        JSON.parse((submit![1] as RequestInit).body as string),
      ).toMatchObject({ type: "attack", unitId: "u1", targetUnitId: "e2" });
    });
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

describe("BattlefieldView · production", () => {
  const BASE = {
    id: "b1",
    typeId: "base",
    position: { x: 2, y: 2 },
    ownerPlayerId: "me",
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };

  it("opens the build menu on an owned base and submits produce (no client newUnitId)", async () => {
    const v = view([], [BASE]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 2")); // click the base
    expect(screen.getByText("INTEL")).toBeInTheDocument();
    // Funds 1000 (fixture) afford infantry but not the tank.
    await userEvent.click(screen.getByRole("button", { name: /Tank/ }));
    expect(screen.getByRole("button", { name: /^Build ·/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Infantry/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Build ·/ }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/actions"),
      );
      expect(submit).toBeDefined();
      const body = JSON.parse((submit![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        type: "produce",
        propertyId: "b1",
        unitTypeId: "infantry",
        expectedStateVersion: 4,
      });
      // The server assigns the new unit id — the client must not send one.
      expect(body).not.toHaveProperty("newUnitId");
    });
  });

  it("does not open the build menu on an enemy base", async () => {
    const enemyBase = { ...BASE, ownerPlayerId: "foe" };
    const v = view([], [enemyBase]);
    stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 2"));
    expect(screen.queryByText("Build")).not.toBeInTheDocument();
  });
});

describe("BattlefieldView · logistics", () => {
  function submitBody(fetchMock: ReturnType<typeof stubFetch>) {
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/actions"),
    );
    return call
      ? JSON.parse((call[1] as RequestInit).body as string)
      : undefined;
  }

  it("loads infantry onto an adjacent friendly transport", async () => {
    const inf = { ...TANK, id: "inf", typeId: "infantry", fuel: 99 };
    const apc = {
      ...TANK,
      id: "apc",
      typeId: "apc",
      ammo: 0,
      fuel: 60,
      position: { x: 3, y: 1 },
    };
    const v = view([inf, apc]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select infantry
    await userEvent.click(screen.getByLabelText("Tile 3, 1")); // the APC tile
    await userEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() =>
      expect(submitBody(fetchMock)).toMatchObject({
        type: "load",
        unitId: "inf",
      }),
    );
  });

  it("dives a surfaced submarine in place", async () => {
    const sub = {
      ...TANK,
      id: "sub",
      typeId: "submarine",
      fuel: 60,
      position: { x: 2, y: 1 },
      specialState: "surfaced",
    };
    const v = view([sub]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select sub
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Dive" }));

    await waitFor(() => {
      const body = submitBody(fetchMock);
      expect(body).toMatchObject({ type: "dive", unitId: "sub" });
      // Dive carries no move component.
      expect(body).not.toHaveProperty("path");
    });
  });

  it("shows the terrain name + defense under the cursor", async () => {
    const v = view();
    stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.hover(screen.getByLabelText("Tile 0, 0"));
    expect(screen.getByText("Plain")).toBeInTheDocument();
    expect(screen.getByText(/^Def/)).toBeInTheDocument();
  });

  it("draws the move-path arrow to a hovered reachable tile", async () => {
    const v = view([{ ...TANK, fuel: 6 }]);
    stubFetch(v);
    const { container } = render(
      <BattlefieldView matchView={v} gameData={combatGameData()} />,
    );

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select tank
    await userEvent.hover(screen.getByLabelText("Tile 3, 1")); // reachable tile
    expect(container.querySelector("[data-path]")).not.toBeNull();
  });

  it("hatches an indirect unit's firing ring, but only once Space asks for it", async () => {
    const gd = combatGameData();
    const artillery = {
      ...gd.units.tank,
      movement: { ...gd.units.tank!.movement, can_move_and_attack: false },
      combat: { type: "indirect", min_range: 2, max_range: 3 },
    };
    const indirect = {
      ...gd,
      units: { ...gd.units, tank: artillery },
    } as unknown as GameData;
    const v = view();
    stubFetch(v);
    const hatch = (label: string) =>
      screen.getByLabelText(label).querySelector("[data-attack-range]");

    render(<BattlefieldView matchView={v} gameData={indirect} />);
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select
    expect(hatch("Tile 2, 3")).toBeNull(); // the board starts clean

    await userEvent.keyboard(" ");
    expect(hatch("Tile 2, 3")).not.toBeNull(); // distance 2 — in the ring
    expect(hatch("Tile 2, 2")).toBeNull(); // distance 1 — inside the minimum

    // Selecting again starts clean, even though the range was left open.
    await userEvent.click(screen.getByLabelText("Tile 0, 3")); // deselect
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    expect(hatch("Tile 2, 3")).toBeNull();
  });

  it("toggles the attack range with Space (and the Range chip)", async () => {
    const v = view();
    stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);
    const hatch = (label: string) =>
      screen.getByLabelText(label).querySelector("[data-attack-range]");

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select the tank
    const chip = screen.getByRole("button", { name: /Range/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    // (0,2) is 3 tiles away: outside the fuel-2 move range, inside its threat.
    expect(hatch("Tile 0, 2")).toBeNull();

    await userEvent.keyboard(" ");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(hatch("Tile 0, 2")).not.toBeNull(); // threat range now painted

    await userEvent.keyboard(" ");
    expect(hatch("Tile 0, 2")).toBeNull();

    // A fresh selection starts hidden again, even with the range left open.
    await userEvent.keyboard(" ");
    await userEvent.click(screen.getByLabelText("Tile 0, 3")); // deselect
    await userEvent.click(screen.getByLabelText("Tile 2, 1"));
    expect(screen.getByRole("button", { name: /Range/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("unloads a single cargo unit onto an adjacent tile", async () => {
    const apc = {
      ...TANK,
      id: "apc",
      typeId: "apc",
      ammo: 0,
      fuel: 60,
      position: { x: 2, y: 1 },
      cargoUnitIds: ["inf"],
    };
    const cargo = {
      ...TANK,
      id: "inf",
      typeId: "infantry",
      position: null,
    };
    const v = view([apc, cargo]);
    const fetchMock = stubFetch(v);
    render(<BattlefieldView matchView={v} gameData={combatGameData()} />);

    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // select APC
    await userEvent.click(screen.getByLabelText("Tile 2, 1")); // in-place menu
    await userEvent.click(screen.getByRole("button", { name: "Unload" }));
    // Single cargo → straight to drop-tile selection; drop to the north.
    await userEvent.click(screen.getByLabelText("Tile 2, 0"));

    await waitFor(() =>
      expect(submitBody(fetchMock)).toMatchObject({
        type: "unload",
        unitId: "apc",
        unloads: [{ cargoUnitId: "inf", to: { x: 2, y: 0 } }],
      }),
    );
  });
});
