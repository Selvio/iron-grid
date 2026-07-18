"use client";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * Action / confirmation panel (M10-T6).
 *
 * The Advance-Wars post-move menu (`game-specification.md` §11, §27.2): at a
 * chosen destination it offers the **selectable** follow-up actions legal there —
 * Wait, Capture, Attack — each committing with **no undo** (§10.4). Attack opens
 * a target picker (`select-target`); choosing a target shows the min/max damage +
 * counter forecast (`combat-preview`) before the final Attack confirm. Cancel
 * steps back one state. Renders nothing outside the menu / target / preview
 * states.
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
  /** Step back one interaction state. */
  readonly onCancel: () => void;
}

export function ActionPanel({
  state,
  handlers,
}: {
  state: InteractionState;
  handlers: ActionPanelHandlers;
}) {
  if (
    state.kind !== "action-menu" &&
    state.kind !== "select-target" &&
    state.kind !== "combat-preview"
  ) {
    return null;
  }

  const title =
    state.kind === "combat-preview"
      ? "Combat"
      : state.kind === "select-target"
        ? "Choose target"
        : "Actions";

  return (
    <Card className="pointer-events-auto absolute bottom-4 right-4 w-64">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {state.kind === "select-target"
            ? "Select an enemy to attack"
            : `To (${state.destination.x}, ${state.destination.y}) · no undo`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.kind === "action-menu" && (
          <div className="flex flex-col gap-1.5">
            {state.options.canWait && (
              <Button variant="secondary" onClick={handlers.onWait}>
                Wait
              </Button>
            )}
            {state.options.canCapture && (
              <Button variant="secondary" onClick={handlers.onCapture}>
                Capture
              </Button>
            )}
            {state.options.attackTargets.length > 0 && (
              <Button variant="secondary" onClick={handlers.onAttack}>
                Attack
              </Button>
            )}
          </div>
        )}

        {state.kind === "combat-preview" && (
          <dl className="font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Damage</dt>
              <dd>
                {state.preview.minDamage}–{state.preview.maxDamage}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Counter</dt>
              <dd>
                {state.preview.counter
                  ? `${state.preview.counter.minDamage}–${state.preview.counter.maxDamage}`
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
