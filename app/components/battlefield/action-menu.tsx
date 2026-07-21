"use client";

import type { Coordinate } from "game-engine";
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Combine,
  Flag,
  Fuel,
  Swords,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";

import { playSfx } from "@/app/lib/audio/sfx";
import type { DestinationOptions, UnitMenu } from "@/app/lib/preview/actions";

import type { ActionPanelHandlers } from "./action-panel";

/**
 * The Advance-Wars post-move menu, styled to the design mockup
 * (`Iron Grid.dc.html` — ACTION MENU): a cream card with a blue title bar naming
 * the unit, then one row per action with its icon and a keyboard hint.
 *
 * The core actions are **always listed**, greyed out when they are not legal
 * here. That is the mockup's behaviour and the right one: the menu keeps a
 * stable shape, so Wait is always in the same place, and a greyed Capture tells
 * the player *why* nothing happened where a missing row says nothing at all.
 * Situational actions (unload, dive, surface) only appear when they apply —
 * offering a tank the choice to dive would teach the wrong thing.
 *
 * @see docs/05-design/Iron Grid.dc.html
 */

/** One row of the menu. */
interface ActionRow {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly enabled: boolean;
  /** Attack reads in the danger colour, as the only irreversible strike. */
  readonly danger?: boolean;
  /**
   * The Move/Wait row that ends the activation. Marked so the auto-focus can
   * refuse to land on it — see `useActionMenuFocus`.
   */
  readonly commit?: boolean;
  readonly onClick: () => void;
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

function rowsFor(
  options: DestinationOptions,
  menu: UnitMenu,
  destination: Coordinate,
  unitOrigin: Coordinate | null,
  handlers: ActionPanelHandlers,
): ActionRow[] {
  // A unit that can never do something does not get a row for it. "Legal
  // somewhere in this unit's menu, or legal right here" is the closest the
  // projected view gets to "this unit is capable of it", and it is enough to
  // keep the list honest without inventing capability data.
  const capable = {
    attack: menu.attacks.length > 0 || options.attackTargets.length > 0,
    capture: menu.captureDestinations.length > 0 || options.canCapture,
    supply: menu.supplyDestinations.length > 0 || options.canSupply,
    load: menu.loadDestinations.length > 0 || options.canLoad,
    join: menu.joinDestinations.length > 0 || options.canJoin,
  };

  const rows: ActionRow[] = [];
  if (capable.attack) {
    rows.push({
      label: "Attack",
      icon: Swords,
      danger: true,
      enabled: options.attackTargets.length > 0,
      onClick: handlers.onAttack,
    });
  }
  if (capable.capture) {
    rows.push({
      label: "Capture",
      icon: Flag,
      enabled: options.canCapture,
      onClick: handlers.onCapture,
    });
  }
  if (capable.supply) {
    rows.push({
      label: "Supply",
      icon: Fuel,
      enabled: options.canSupply,
      onClick: handlers.onSupply,
    });
  }
  if (capable.load) {
    rows.push({
      label: "Load",
      icon: ArrowDownToLine,
      enabled: options.canLoad,
      onClick: handlers.onLoad,
    });
  }
  if (capable.join) {
    rows.push({
      label: "Join",
      icon: Combine,
      enabled: options.canJoin,
      onClick: handlers.onJoin,
    });
  }
  // Situational: shown only where they mean something.
  if (options.canUnload) {
    rows.push({
      label: "Unload",
      icon: ArrowUpFromLine,
      enabled: true,
      onClick: handlers.onUnload,
    });
  }
  if (options.canDive) {
    rows.push({
      label: "Dive",
      icon: Anchor,
      enabled: true,
      onClick: handlers.onDive,
    });
  }
  if (options.canSurface) {
    rows.push({
      label: "Surface",
      icon: Waves,
      enabled: true,
      onClick: handlers.onSurface,
    });
  }
  rows.push({
    label: commitLabel(destination, unitOrigin),
    icon: Clock,
    enabled: options.canWait,
    commit: true,
    onClick: handlers.onWait,
  });
  return rows;
}

export function ActionMenu({
  options,
  menu,
  destination,
  unitOrigin,
  unitName,
  handlers,
  onKeyDown,
  busy = false,
}: {
  options: DestinationOptions;
  menu: UnitMenu;
  destination: Coordinate;
  unitOrigin: Coordinate | null;
  /** Shown in the title bar; falls back to a generic label. */
  unitName?: string;
  handlers: ActionPanelHandlers;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /**
   * A submit is in flight. The menu stays mounted until the reconciling refetch
   * clears it, so every row — Cancel included — goes dead for that window: a
   * second click would otherwise fire a duplicate action, and a Cancel would
   * step the interaction back out from under a decision already sent.
   */
  busy?: boolean;
}) {
  const rows = rowsFor(options, menu, destination, unitOrigin, handlers);
  // Enter fires whatever holds focus, so the hint must name the row the menu
  // actually opens on — the first enabled row that is *not* the commit
  // (see `useActionMenuFocus`). When Move/Wait is the only thing legal here,
  // focus goes to Cancel and no action row may claim the hint.
  const primary = rows.findIndex((row) => row.enabled && row.commit !== true);

  return (
    <div
      role="group"
      aria-label={`${unitName ?? "Unit"} actions`}
      className="pointer-events-auto absolute right-6 top-24 w-[200px] overflow-hidden rounded-2xl border-4 border-[#1c2b45] bg-[#fff6e0] shadow-[0_6px_0_rgba(28,43,69,0.32)]"
    >
      <div className="flex items-center gap-2 border-b-[3px] border-[#1c2b45] bg-[#4a93f7] px-3 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-white" />
        <span className="font-display text-[13px] font-extrabold text-white">
          {unitName ?? "Unit"} — actions
        </span>
      </div>
      <div data-action-menu className="p-1.5" onKeyDown={onKeyDown}>
        {rows.map((row, index) => (
          <MenuRow
            key={row.label}
            row={row}
            busy={busy}
            hint={index === primary ? "↵" : undefined}
          />
        ))}
        <MenuRow
          busy={busy}
          row={{
            label: "Cancel",
            icon: X,
            enabled: true,
            onClick: handlers.onCancel,
          }}
          hint="esc"
        />
      </div>
      {/* §10.4: every action here commits immediately, and the player is told
          so before choosing, not after. */}
      <p className="border-t-2 border-[#e8d9ae] px-3 py-1.5 font-mono text-[10px] font-bold text-[#a99a6a]">
        To ({destination.x}, {destination.y}) · no undo
      </p>
    </div>
  );
}

function MenuRow({
  row,
  hint,
  busy = false,
}: {
  row: ActionRow;
  hint?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!row.enabled || busy}
      data-commit={row.commit === true ? "true" : undefined}
      onClick={() => {
        // The blip the original played on every menu confirmation.
        playSfx("ui_confirm");
        row.onClick();
      }}
      className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left font-display text-sm font-bold enabled:hover:bg-[#ffe9b0] disabled:cursor-not-allowed disabled:opacity-[0.42] ${
        row.danger
          ? "text-[#d33f3a]"
          : row.enabled
            ? "text-[#1c2b45]"
            : "text-[#a99a6a]"
      }`}
    >
      <row.icon className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
      <span className="flex-1">{row.label}</span>
      {hint !== undefined && (
        // Decorative: it repeats a key binding the row's own name never had.
        <span
          aria-hidden
          className="font-mono text-[10px] font-extrabold text-[#a99a6a]"
        >
          {hint}
        </span>
      )}
    </button>
  );
}
