"use client";

import { displayHp, type Coordinate } from "game-engine";

import type { InteractionState } from "@/app/lib/battlefield/machine";
import type { UnitSprite } from "@/app/lib/preview/actions";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

import { BuildMenu } from "./build-menu";

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

/** A pixel-art unit sprite crop for a menu row (CSS sprite; null → nothing). */
function SpriteIcon({ sprite }: { sprite: UnitSprite | null }) {
  if (sprite === null) return null;
  return (
    <span
      aria-hidden
      className="shrink-0"
      style={{
        width: sprite.frameSize,
        height: sprite.frameSize,
        backgroundImage: `url(${sprite.sheetUrl})`,
        backgroundPosition: `-${sprite.frameX}px -${sprite.frameY}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    />
  );
}

/**
 * A combat forecast as an Advance-Wars damage percentage — the preview is in
 * true-HP points against a 100-HP unit, so the number already reads as a percent.
 * Collapses to a single value when luck adds no spread.
 */
function damageRange(min: number, max: number): string {
  return min === max ? `${max}%` : `${min}–${max}%`;
}

/** Label for ending activation: "Move" when relocating, "Wait" when staying. */
function commitLabel(
  destination: Coordinate,
  unitOrigin: Coordinate | null,
): string {
  if (
    unitOrigin !== null &&
    (unitOrigin.x !== destination.x || unitOrigin.y !== destination.y)
  ) {
    return "Move";
  }
  return "Wait";
}

export function ActionPanel({
  state,
  handlers,
  unitOrigin = null,
  funds = 0,
}: {
  state: InteractionState;
  handlers: ActionPanelHandlers;
  /** The selected unit's current tile — used to label Move vs Wait. */
  unitOrigin?: Coordinate | null;
  /** The viewer's funds — shown in the build popup's roster header. */
  funds?: number;
}) {
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

  if (state.kind === "unload-cargo") {
    return (
      <Card className="pointer-events-auto absolute bottom-4 right-4 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
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
                <SpriteIcon sprite={c.sprite} />
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
      <Card className="pointer-events-auto absolute bottom-4 right-4 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
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
    <Card className="pointer-events-auto absolute bottom-4 right-4 w-64 border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
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
                {commitLabel(state.destination, unitOrigin)}
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
            {state.options.canLoad && (
              <Button variant="secondary" onClick={handlers.onLoad}>
                Load
              </Button>
            )}
            {state.options.canJoin && (
              <Button variant="secondary" onClick={handlers.onJoin}>
                Join
              </Button>
            )}
            {state.options.canSupply && (
              <Button variant="secondary" onClick={handlers.onSupply}>
                Supply
              </Button>
            )}
            {state.options.canUnload && (
              <Button variant="secondary" onClick={handlers.onUnload}>
                Unload
              </Button>
            )}
            {state.options.canDive && (
              <Button variant="secondary" onClick={handlers.onDive}>
                Dive
              </Button>
            )}
            {state.options.canSurface && (
              <Button variant="secondary" onClick={handlers.onSurface}>
                Surface
              </Button>
            )}
          </div>
        )}

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
