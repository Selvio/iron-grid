import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import { ActionPanel } from "../action-panel";

describe("ActionPanel", () => {
  it("renders nothing before a destination is chosen", () => {
    const { container } = render(
      <ActionPanel
        state={{ kind: "idle" }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the combat forecast (min-max + counter) with no-undo confirm", async () => {
    const state: InteractionState = {
      kind: "combat-preview",
      unitId: "u1",
      reachable: [],
      destination: { x: 3, y: 2 },
      actions: ["attack"],
      targetUnitId: "e1",
      preview: {
        attackerUnitId: "u1",
        defenderUnitId: "e1",
        minDamage: 4,
        maxDamage: 6,
        counter: { minDamage: 1, maxDamage: 2 },
      },
    };
    const onConfirm = vi.fn();
    render(
      <ActionPanel state={state} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("4–6")).toBeInTheDocument();
    expect(screen.getByText("1–2")).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
