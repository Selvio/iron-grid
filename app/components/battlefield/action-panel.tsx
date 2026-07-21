"use client";

import type { Coordinate } from "game-engine";
import { useEffect } from "react";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

import { ActionMenu } from "./action-menu";
import { CombatPreviewPanel, type CombatAttacker } from "./combat-preview";
import { BuildMenu } from "./build-menu";
import { PixelSprite } from "./pixel-sprite";

/**
 * Action / confirmation panel (M10-T6).
 *
 * The Advance-Wars post-move menu (`game-specification.md` §11, §27.2): at a
 * chosen destination it offers the **selectable** follow-up actions legal there —
 * Move/Wait, Capture, Attack — each committing with **no undo** (§10.4). Attack
 * opens a target picker (`select-target`); choosing a target shows the min/max
 * damage + counter forecast (`combat-preview`) before the final Attack confirm.
 * Cancel steps back one state. Renders nothing outside the menu / target /
 * preview states.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

/** Callbacks the controller wires to each menu action. */
export interface ActionPanelHandlers {
  /** Commit a `move_and_wait` to the chosen tile. */
  readonly onWait: () => void;
  /** Commit a `capture` at the chosen tile. */
  readonly onCapture: () => void;
  /** Open the target picker (or forecast, when a single target exists). */
  readonly onAttack: () => void;
  /** Commit the previewed `attack`. */
  readonly onConfirmAttack: () => void;
  /** Commit a `produce` of the given unit type at the selected property. */
  readonly onProduce: (unitTypeId: string) => void;
  /** Commit a `supply` at the chosen tile (APC). */
  readonly onSupply: () => void;
  /** Commit a `join` onto the friendly same-type unit. */
  readonly onJoin: () => void;
  /** Commit a `load` onto the friendly transport. */
  readonly onLoad: () => void;
  /** Open the unload flow (choose cargo → drop tile). */
  readonly onUnload: () => void;
  /** Commit an in-place `dive`. */
  readonly onDive: () => void;
  /** Commit an in-place `surface`. */
  readonly onSurface: () => void;
  /** Pick which cargo to unload (from the multi-cargo picker). */
  readonly onChooseCargo: (cargoUnitId: string) => void;
  /** Step back one interaction state. */
  readonly onCancel: () => void;
}

/**
 * The post-move menu takes focus as soon as it opens, so the next key lands on
 * the menu rather than back on the board. The menu only appears in response to
 * a deliberate choice of destination, so taking focus is what the player just
 * asked for.
 *
 * It lands on the first *enabled* row — a greyed-out action would make Enter do
 * nothing and look broken — but **never on the Move/Wait row that ends the
 * activation**. The keyboard opens this menu with Enter on a tile, so an Enter
 * held a beat too long, or pressed twice out of habit, would arrive here and
 * commit an action with no undo (§10.4) that the player never asked for. When
 * Move/Wait is the only thing legal here the focus falls through to Cancel,
 * which is the last button in the menu and always enabled: the stray key then
 * costs a re-open instead of the unit's whole turn.
 */
function useActionMenuFocus(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const menu = document.querySelector("[data-action-menu]");
    if (menu === null) return;
    const rows = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    ];
    rows.find((row) => row.dataset.commit === undefined)?.focus();
  }, [open]);
}

/** Arrows walk the menu's actions; the list is read off the event's own node. */
function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  ];
  if (buttons.length === 0) return;
  event.preventDefault();
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next =
    (((at === -1 ? 0 : at + step) % buttons.length) + buttons.length) %
    buttons.length;
  buttons[next]!.focus();
}

export function ActionPanel({
  state,
  handlers,
  unitOrigin = null,
  unitName,
  attacker = null,
  funds = 0,
  busy = false,
}: {
  state: InteractionState;
  handlers: ActionPanelHandlers;
  /** The selected unit's current tile — used to label Move vs Wait. */
  unitOrigin?: Coordinate | null;
  /** The selected unit's display name, for the menu's title bar. */
  unitName?: string;
  /** The selected unit as the attacker, for the combat forecast. */
  attacker?: CombatAttacker | null;
  /** The viewer's funds — shown in the build popup's roster header. */
  funds?: number;
  /** An action is in flight — the panel is sealed until it reconciles. */
  busy?: boolean;
}) {
  useActionMenuFocus(state.kind === "action-menu");

  // Every panel below commits with no undo, and each stays mounted from the
  // click until the reconciling refetch deselects it — a window wide enough for
  // a second click to land. So each one takes `busy` and goes dead for it,
  // Cancel included: stepping the interaction back out from under a decision
  // already on the wire is no safer than sending it twice.
  return panel();

  function panel() {
    if (state.kind === "production-menu") {
      return (
        <BuildMenu
          options={state.options}
          funds={funds}
          onProduce={handlers.onProduce}
          onCancel={handlers.onCancel}
          busy={busy}
        />
      );
    }

    if (state.kind === "action-menu") {
      return (
        <ActionMenu
          options={state.options}
          menu={state.menu}
          destination={state.destination}
          unitOrigin={unitOrigin}
          unitName={unitName}
          handlers={handlers}
          onKeyDown={onMenuKeyDown}
          busy={busy}
        />
      );
    }

    if (state.kind === "combat-preview") {
      return (
        <CombatPreviewPanel
          attacker={attacker}
          defender={state.defender}
          minDamage={state.preview.minDamage}
          maxDamage={state.preview.maxDamage}
          counter={state.preview.counter ?? null}
          onConfirm={handlers.onConfirmAttack}
          onCancel={handlers.onCancel}
          busy={busy}
        />
      );
    }

    if (state.kind === "unload-cargo") {
      return (
        <Card className="pointer-events-auto absolute right-6 top-24 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
          <CardHeader>
            <CardTitle>Unload</CardTitle>
            <CardDescription>Choose a unit to drop</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {state.cargo.map((c) => (
                <Button
                  key={c.unitId}
                  variant="secondary"
                  className="h-auto justify-start gap-2 py-2"
                  disabled={busy}
                  onClick={() => handlers.onChooseCargo(c.unitId)}
                >
                  <PixelSprite sprite={c.sprite} box={28} />
                  <span>{c.displayName}</span>
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={handlers.onCancel}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (state.kind === "unload-drop") {
      return (
        <Card className="pointer-events-auto absolute right-6 top-24 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
          <CardHeader>
            <CardTitle>Unload</CardTitle>
            <CardDescription>
              Click an adjacent tile to drop · no undo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              disabled={busy}
              onClick={handlers.onCancel}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (state.kind !== "select-target") return null;

    return (
      <Card className="pointer-events-auto absolute right-6 top-24 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
        <CardHeader>
          <CardTitle>Choose target</CardTitle>
          <CardDescription>Select an enemy to attack</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={handlers.onCancel}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }
}
