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
 * Shown at a chosen destination or a combat preview. It lists the available
 * follow-up actions and, for an attack, the min/max damage + counter forecast,
 * then confirms with **no undo** (`game-specification.md` §10.4): Confirm commits
 * (the submit lands in T7), Cancel steps back one state. Renders nothing outside
 * the destination / combat-preview states.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

const ACTION_LABEL: Record<string, string> = {
  move_and_wait: "Move here",
  attack: "Attack",
  capture: "Capture",
  supply: "Supply",
  load: "Load",
  unload: "Unload",
  join: "Join",
  dive: "Dive",
  surface: "Surface",
};

export function ActionPanel({
  state,
  onConfirm,
  onCancel,
}: {
  state: InteractionState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state.kind !== "destination" && state.kind !== "combat-preview") {
    return null;
  }

  return (
    <Card className="pointer-events-auto absolute bottom-4 right-4 w-64">
      <CardHeader>
        <CardTitle>
          {state.kind === "combat-preview" ? "Combat" : "Confirm move"}
        </CardTitle>
        <CardDescription>
          To ({state.destination.x}, {state.destination.y}) · no undo
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.kind === "destination" && state.actions.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {state.actions.map((action) => (
              <li
                key={action}
                className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {ACTION_LABEL[action] ?? action}
              </li>
            ))}
          </ul>
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
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
