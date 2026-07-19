import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import type { DestinationOptions, UnitMenu } from "@/app/lib/preview/actions";
import { ActionPanel, type ActionPanelHandlers } from "../action-panel";

const MENU: UnitMenu = {
  moveDestinations: [{ x: 3, y: 2 }],
  captureDestinations: [],
  attacks: [],
  supplyDestinations: [],
  joinDestinations: [],
  loadDestinations: [],
  unloadDestinations: [],
  diveDestinations: [],
  surfaceDestinations: [],
};

/** A full DestinationOptions with everything off, overridden by `p`. */
function opts(p: Partial<DestinationOptions> = {}): DestinationOptions {
  return {
    canWait: false,
    canCapture: false,
    attackTargets: [],
    canSupply: false,
    canJoin: false,
    canLoad: false,
    canUnload: false,
    canDive: false,
    canSurface: false,
    ...p,
  };
}

function handlers(
  overrides: Partial<ActionPanelHandlers> = {},
): ActionPanelHandlers {
  return {
    onWait: vi.fn(),
    onCapture: vi.fn(),
    onAttack: vi.fn(),
    onConfirmAttack: vi.fn(),
    onProduce: vi.fn(),
    onSupply: vi.fn(),
    onJoin: vi.fn(),
    onLoad: vi.fn(),
    onUnload: vi.fn(),
    onDive: vi.fn(),
    onSurface: vi.fn(),
    onChooseCargo: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("ActionPanel", () => {
  it("renders nothing before a destination is chosen", () => {
    const { container } = render(
      <ActionPanel state={{ kind: "idle" }} handlers={handlers()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the actions legal at the destination, each selectable", async () => {
    const state: InteractionState = {
      kind: "action-menu",
      unitId: "u1",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canWait: true, canCapture: true, attackTargets: ["e1"] }),
    };
    const onWait = vi.fn();
    const onAttack = vi.fn();
    render(
      <ActionPanel
        state={state}
        unitOrigin={{ x: 1, y: 2 }}
        handlers={handlers({ onWait, onAttack })}
      />,
    );

    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onWait).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(onAttack).toHaveBeenCalledOnce();
  });

  it("labels the commit button Move when relocating and Wait when staying", () => {
    const relocating: InteractionState = {
      kind: "action-menu",
      unitId: "u1",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canWait: true }),
    };
    const { rerender } = render(
      <ActionPanel
        state={relocating}
        unitOrigin={{ x: 1, y: 2 }}
        handlers={handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();

    rerender(
      <ActionPanel
        state={relocating}
        unitOrigin={{ x: 3, y: 2 }}
        handlers={handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Wait" })).toBeInTheDocument();
  });

  it("hides actions that are not legal at the destination", () => {
    const state: InteractionState = {
      kind: "action-menu",
      unitId: "u1",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canWait: true }),
    };
    render(
      <ActionPanel
        state={state}
        unitOrigin={{ x: 0, y: 0 }}
        handlers={handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Capture" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Attack" }),
    ).not.toBeInTheDocument();
  });

  it("shows the combat forecast (min-max + counter) with a no-undo Attack confirm", async () => {
    const state: InteractionState = {
      kind: "combat-preview",
      unitId: "u1",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canWait: true, attackTargets: ["e1"] }),
      targetUnitId: "e1",
      preview: {
        attackerUnitId: "u1",
        defenderUnitId: "e1",
        minDamage: 4,
        maxDamage: 6,
        counter: { minDamage: 1, maxDamage: 2 },
      },
    };
    const onConfirmAttack = vi.fn();
    render(
      <ActionPanel state={state} handlers={handlers({ onConfirmAttack })} />,
    );

    expect(screen.getByText("4–6%")).toBeInTheDocument();
    expect(screen.getByText("1–2%")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(onConfirmAttack).toHaveBeenCalledOnce();
  });

  it("renders the build popup, shows the selected unit's intel, and builds it", async () => {
    const state: InteractionState = {
      kind: "production-menu",
      property: { id: "b1", position: { x: 2, y: 3 } },
      options: [
        {
          unitTypeId: "infantry",
          displayName: "Infantry",
          cost: 1000,
          affordable: true,
          sprite: {
            sheetUrl: "/game-assets/units/blue-units-sprite-sheet.png",
            frameX: 0,
            frameY: 16,
            frameSize: 32,
          },
          stats: {
            move: 3,
            vision: 2,
            gas: 99,
            ammo: null,
            weapon1: "M Gun",
            weapon2: null,
            mobility: "Foot",
            domain: "ground",
          },
        },
        {
          unitTypeId: "neotank",
          displayName: "Neotank",
          cost: 22000,
          affordable: false,
          sprite: null,
          stats: {
            move: 6,
            vision: 1,
            gas: 99,
            ammo: 9,
            weapon1: "Neo Gun",
            weapon2: "M Gun",
            mobility: "Treads",
            domain: "ground",
          },
        },
      ],
    };
    const onProduce = vi.fn();
    render(
      <ActionPanel
        state={state}
        funds={4200}
        handlers={handlers({ onProduce })}
      />,
    );

    // The roster header shows funds; the intel panel the first unit's stats.
    expect(screen.getByText("4,200")).toBeInTheDocument();
    expect(screen.getByText("M Gun")).toBeInTheDocument();
    expect(screen.getByText("×∞")).toBeInTheDocument();

    // Selecting the unaffordable unit swaps the intel and blocks Build.
    await userEvent.click(screen.getByRole("button", { name: /Neotank/ }));
    expect(screen.getByText("Neo Gun")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Build · 22,000 G/ }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Infantry/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Build · 1,000 G/ }),
    );
    expect(onProduce).toHaveBeenCalledWith("infantry");
  });

  it("shows logistics buttons only when legal and fires their handlers", async () => {
    const state: InteractionState = {
      kind: "action-menu",
      unitId: "apc",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canWait: true, canLoad: true, canSupply: true }),
    };
    const onLoad = vi.fn();
    const onSupply = vi.fn();
    render(
      <ActionPanel
        state={state}
        unitOrigin={{ x: 3, y: 2 }}
        handlers={handlers({ onLoad, onSupply })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Join" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(onLoad).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Supply" }));
    expect(onSupply).toHaveBeenCalledOnce();
  });

  it("renders the unload cargo picker and chooses a cargo", async () => {
    const state: InteractionState = {
      kind: "unload-cargo",
      unitId: "apc",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: opts({ canUnload: true }),
      cargo: [
        { unitId: "inf1", displayName: "Infantry", sprite: null },
        { unitId: "mech1", displayName: "Mech", sprite: null },
      ],
    };
    const onChooseCargo = vi.fn();
    render(
      <ActionPanel state={state} handlers={handlers({ onChooseCargo })} />,
    );

    expect(screen.getByText("Unload")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Mech/ }));
    expect(onChooseCargo).toHaveBeenCalledWith("mech1");
  });
});
