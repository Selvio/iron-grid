import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import type { UnitMenu } from "@/app/lib/preview/actions";
import { ActionPanel, type ActionPanelHandlers } from "../action-panel";

const MENU: UnitMenu = {
  moveDestinations: [{ x: 3, y: 2 }],
  captureDestinations: [],
  attacks: [],
};

function handlers(
  overrides: Partial<ActionPanelHandlers> = {},
): ActionPanelHandlers {
  return {
    onWait: vi.fn(),
    onCapture: vi.fn(),
    onAttack: vi.fn(),
    onConfirmAttack: vi.fn(),
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
      options: { canWait: true, canCapture: true, attackTargets: ["e1"] },
    };
    const onWait = vi.fn();
    const onAttack = vi.fn();
    render(
      <ActionPanel state={state} handlers={handlers({ onWait, onAttack })} />,
    );

    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Wait" }));
    expect(onWait).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(onAttack).toHaveBeenCalledOnce();
  });

  it("hides actions that are not legal at the destination", () => {
    const state: InteractionState = {
      kind: "action-menu",
      unitId: "u1",
      menu: MENU,
      destination: { x: 3, y: 2 },
      options: { canWait: true, canCapture: false, attackTargets: [] },
    };
    render(<ActionPanel state={state} handlers={handlers()} />);
    expect(screen.getByRole("button", { name: "Wait" })).toBeInTheDocument();
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
      options: { canWait: true, canCapture: false, attackTargets: ["e1"] },
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

    expect(screen.getByText("4–6")).toBeInTheDocument();
    expect(screen.getByText("1–2")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(onConfirmAttack).toHaveBeenCalledOnce();
  });
});
