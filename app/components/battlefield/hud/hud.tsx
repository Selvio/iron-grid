"use client";

import { displayHp } from "game-engine";
import { Clock, Droplet, Target } from "lucide-react";
import { useEffect, useState } from "react";

import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";
import { formatFunds } from "@/app/lib/format";
import { formatCountdown } from "@/app/lib/format";

/**
 * Battlefield HUD (M10-T4).
 *
 * Accessible HTML around the canvas (React owns the DOM, `frontend.md` §1, §3):
 * day, whose-turn + active faction, the deadline countdown, the viewer's funds,
 * and a selected-unit panel (HP 0–10, fuel, ammo). Reuses the M9 formatters and
 * `FactionBadge` (color + insignia). The countdown clock is client-owned and
 * ticks each minute; tests inject a fixed `nowMs`.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T4)
 */

/** The minimal unit shape the selected-unit panel reads. */
export interface HudUnit {
  readonly typeId: string;
  readonly ownerPlayerId: string;
  readonly trueHp: number;
  readonly fuel: number;
  readonly ammo: number;
}

/** The terrain under the cursor (name + defense stars), Advance-Wars style. */
export interface HudTerrain {
  readonly name: string;
  readonly defenseStars: number;
}

function factionOf(view: MatchView, playerId: string): FactionId | null {
  if (view.you?.playerId === playerId) return view.you.factionId as FactionId;
  if (view.opponent?.playerId === playerId) {
    return view.opponent.factionId as FactionId;
  }
  return null;
}

function titleCase(id: string): string {
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Hud({
  matchView,
  selectedUnit = null,
  terrain = null,
  nowMs,
}: {
  matchView: MatchView;
  selectedUnit?: HudUnit | null;
  terrain?: HudTerrain | null;
  nowMs?: number;
}) {
  const [now, setNow] = useState<number | null>(nowMs ?? null);
  useEffect(() => {
    if (nowMs !== undefined) return;
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [nowMs]);

  const yourTurn = matchView.activePlayerId === matchView.viewerPlayerId;
  const activeFaction = factionOf(matchView, matchView.activePlayerId);
  const selectedFaction = selectedUnit
    ? factionOf(matchView, selectedUnit.ownerPlayerId)
    : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4">
      <div className="pointer-events-auto flex items-center justify-between rounded-lg border border-border bg-card/90 px-4 py-2 text-sm backdrop-blur">
        <span className="font-mono">Day {matchView.currentDay}</span>
        <span className="inline-flex items-center gap-2">
          {activeFaction && <FactionBadge faction={activeFaction} />}
          <span aria-live="polite">
            {yourTurn ? "Your turn" : "Opponent's turn"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
          <Clock className="size-4" aria-hidden="true" />
          {now === null
            ? "—"
            : formatCountdown(matchView.turnDeadlineAt, new Date(now))}
        </span>
      </div>

      {matchView.you && (
        <div className="pointer-events-auto self-start rounded-lg border border-border bg-card/90 px-4 py-2 font-mono text-sm backdrop-blur">
          {formatFunds(matchView.you.funds)}
        </div>
      )}

      {terrain && (
        <div className="pointer-events-auto self-start rounded-lg border border-border bg-card/90 px-4 py-2 text-sm backdrop-blur">
          <span className="font-medium">{terrain.name}</span>
          <span className="ml-3 font-mono text-muted-foreground">
            Def {"★".repeat(terrain.defenseStars) || "0"}
          </span>
        </div>
      )}

      {selectedUnit && (
        <div className="pointer-events-auto self-start rounded-lg border border-border bg-card/90 px-4 py-3 text-sm backdrop-blur">
          <div className="flex items-center gap-2 font-medium">
            {selectedFaction && (
              <FactionBadge faction={selectedFaction} showLabel={false} />
            )}
            {titleCase(selectedUnit.typeId)}
          </div>
          <dl className="mt-2 flex gap-4 font-mono text-muted-foreground">
            <div className="flex items-center gap-1">
              <dt className="sr-only">Health</dt>
              <Target className="size-4" aria-hidden="true" />
              <dd>{displayHp(selectedUnit.trueHp)}/10</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="sr-only">Fuel</dt>
              <Droplet className="size-4" aria-hidden="true" />
              <dd>{selectedUnit.fuel}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="sr-only">Ammo</dt>
              <span aria-hidden="true">◊</span>
              <dd>{selectedUnit.ammo}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
