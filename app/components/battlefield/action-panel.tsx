"use client";

import { displayHp, type Coordinate } from "game-engine";
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
 * A combat forecast as an Advance-Wars damage percentage — the preview is in
 * true-HP points against a 100-HP unit, so the number already reads as a percent.
 * Collapses to a single value when luck adds no spread.
 */
function damageRange(min: number, max: number): string {
  return min === max ? `${max}%` : `${min}–${max}%`;
}

/**
 * The post-move menu takes focus as soon as it opens, so Enter commits without
 * a hunt. The menu only appears in response to a deliberate choice of
 * destination, so taking focus is what the player just asked for.
 */
function useActionMenuFocus(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    // The first *enabled* row: landing on a greyed-out action would make Enter
    // do nothing and look broken.
    document
      .querySelector<HTMLButtonElement>(
        "[data-action-menu] button:not([disabled])",
      )
      ?.focus();
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
  funds = 0,
}: {
  state: InteractionState;
  handlers: ActionPanelHandlers;
  /** The selected unit's current tile — used to label Move vs Wait. */
  unitOrigin?: Coordinate | null;
  /** The selected unit's display name, for the menu's title bar. */
  unitName?: string;
  /** The viewer's funds — shown in the build popup's roster header. */
  funds?: number;
}) {
  useActionMenuFocus(state.kind === "action-menu");

  if (state.kind === "production-menu") {
    return (
      <BuildMenu
        options={state.options}
        funds={funds}
        onProduce={handlers.onProduce}
        onCancel={handlers.onCancel}
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
                onClick={() => handlers.onChooseCargo(c.unitId)}
              >
                <PixelSprite sprite={c.sprite} box={28} />
                <span>{c.displayName}</span>
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={handlers.onCancel}>
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
          <Button variant="outline" onClick={handlers.onCancel}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind !== "select-target" && state.kind !== "combat-preview") {
    return null;
  }

  const title = state.kind === "combat-preview" ? "Combat" : "Choose target";

  return (
    <Card className="pointer-events-auto absolute right-6 top-24 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {state.kind === "select-target"
            ? "Select an enemy to attack"
            : `To (${state.destination.x}, ${state.destination.y}) · no undo`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.kind === "combat-preview" && (
          <dl className="font-mono text-sm">
            {state.defender && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Target</dt>
                  <dd className="font-sans">{state.defender.displayName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">HP</dt>
                  <dd>
                    {displayHp(state.defender.trueHp)} →{" "}
                    {displayHp(
                      Math.max(
                        0,
                        state.defender.trueHp - state.preview.maxDamage,
                      ),
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Def</dt>
                  <dd>{"★".repeat(state.defender.stars) || "0"}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Damage</dt>
              <dd>
                {damageRange(state.preview.minDamage, state.preview.maxDamage)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Counter</dt>
              <dd>
                {state.preview.counter
                  ? damageRange(
                      state.preview.counter.minDamage,
                      state.preview.counter.maxDamage,
                    )
                  : "none"}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlers.onCancel}
          >
            Cancel
          </Button>
          {state.kind === "combat-preview" && (
            <Button className="flex-1" onClick={handlers.onConfirmAttack}>
              Attack
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
