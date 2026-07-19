"use client";

import { displayHp } from "game-engine";
import { Shield, Sprout, Sun, Swords, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";
import type { UnitSprite } from "@/app/lib/preview/actions";
import { formatCountdown } from "@/app/lib/format";
import { PixelSprite } from "@/app/components/battlefield/pixel-sprite";

/**
 * Battlefield HUD (M10-T4, restyled to the Claude Design mockup).
 *
 * Accessible HTML around the canvas (React owns the DOM, `frontend.md` §1, §3):
 * two Advance-Wars commander cards (viewer + opponent — faction colour, insignia,
 * whose-turn / deadline, power meter, funds), a central DAY pill, and the
 * selected-unit + terrain read-outs. Faction identity is colour **paired with an
 * insignia** (`game-specification.md` §27.4). Opponent funds/power are hidden by
 * the projection, so the opponent card shows only public identity + the deadline.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T4)
 * @see docs/05-design/Iron Grid.dc.html
 */

/** The unit shape the selected-unit panel reads (`Iron Grid.dc.html` unit card). */
export interface HudUnit {
  readonly typeId: string;
  readonly ownerPlayerId: string;
  readonly trueHp: number;
  /** Full true HP for the HP bar ratio (defaults handled by the caller). */
  readonly maxHp: number;
  readonly fuel: number;
  readonly ammo: number;
  /** Movement type (e.g. `treads`) shown in the subtitle. */
  readonly movementType: string;
  /** Movement points shown as MOVE. */
  readonly movePoints: number;
  /** The unit's faction sprite crop for the panel icon. */
  readonly sprite: UnitSprite | null;
  /** Terrain the unit stands on (name + defense stars) for DEF + the footer. */
  readonly terrain: HudTerrain | null;
}

/** The terrain under the cursor (name + defense stars), Advance-Wars style. */
export interface HudTerrain {
  readonly name: string;
  readonly defenseStars: number;
}

/** Up to four defense stars — filled (gold) then hollow. */
function Stars({ n }: { n: number }) {
  const filled = Math.max(0, Math.min(4, n));
  return (
    <span className="text-sm text-[#e0a015]">
      {"★".repeat(filled)}
      <span className="text-[#c9bb96]">{"☆".repeat(4 - filled)}</span>
    </span>
  );
}

/** One labelled stat cell in the unit panel's stat row. */
function Stat({
  label,
  children,
  divider = false,
}: {
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`px-2 py-2 ${divider ? "border-l-2 border-[#1c2b45]/40" : ""}`}
    >
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a7d5e]">
        {label}
      </div>
      <div className="font-display text-lg font-extrabold leading-tight text-[#1c2b45]">
        {children}
      </div>
    </div>
  );
}

const FACTION_ICON: Record<FactionId, LucideIcon> = {
  blue: Shield,
  green: Sprout,
  red: Swords,
  yellow: Sun,
};

const FACTION_BG: Record<FactionId, string> = {
  blue: "bg-faction-blue",
  green: "bg-faction-green",
  red: "bg-faction-red",
  yellow: "bg-faction-yellow",
};

/** The chunky 3D drop shadow the mockup uses on every raised card/button. */
const RAISED = "shadow-[0_5px_0_rgba(28,43,69,0.32)]";
const NAVY = "border-[#1c2b45]";

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

/** The small gold "G" coin the mockup prefixes funds with. */
function Coin() {
  return (
    <span className="inline-flex size-3.5 items-center justify-center rounded-full border-2 border-[#b8860b] bg-[#ffd23c] text-[8px] font-bold text-[#8a6508]">
      G
    </span>
  );
}

/** A commander card — faction colour, insignia, whose-turn/deadline, meter, funds. */
function PlayerCard({
  faction,
  turnLabel,
  deadline,
  funds,
  powerMeter,
  mirror = false,
}: {
  faction: FactionId;
  /** "Your turn" / "Opponent's turn" when this player is active, else null. */
  turnLabel: string | null;
  /** Deadline countdown shown when this player is *not* active. */
  deadline: string | null;
  /** Viewer-only: funds (opponent's are hidden by the projection). */
  funds?: number;
  /** Viewer-only: power-meter points (0–6 pips). */
  powerMeter?: number;
  mirror?: boolean;
}) {
  const Icon = FACTION_ICON[faction];
  const showMeter = funds !== undefined;
  const portrait = (
    <div
      className={`grid size-11 shrink-0 place-items-center rounded-xl border-2 bg-white ${NAVY}`}
    >
      <Icon className="size-6 text-[#1c2b45]" aria-hidden="true" />
    </div>
  );
  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl border-[3px] px-3 py-2.5 ${FACTION_BG[faction]} ${NAVY} ${RAISED} ${mirror ? "flex-row-reverse" : ""}`}
    >
      {portrait}
      <div className={mirror ? "text-right" : ""}>
        <div className="flex items-center gap-2 [text-shadow:0_1px_0_rgba(0,0,0,0.25)]">
          <span className="font-display text-sm font-extrabold uppercase tracking-wide text-white">
            CMDR ·
          </span>
          <span className="font-display text-sm font-extrabold uppercase tracking-wide text-white">
            {titleCase(faction)}
          </span>
          {turnLabel && (
            <span
              className={`rounded-full border-2 bg-[#ffd23c] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#08213f] ${NAVY}`}
            >
              {turnLabel}
            </span>
          )}
          {!turnLabel && deadline && (
            <span className="font-mono text-[11px] font-bold text-white/90">
              DL {deadline}
            </span>
          )}
        </div>
        <div
          className={`mt-1.5 flex items-center gap-2 ${mirror ? "justify-end" : ""}`}
        >
          {showMeter && (
            <>
              <span className="text-[9px] font-extrabold tracking-wider text-white/80">
                PWR
              </span>
              <span className="flex gap-0.5">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2.5 rounded-sm border border-black/30 ${i < Math.min(6, Math.max(0, powerMeter ?? 0)) ? "bg-[#ffd23c]" : "bg-black/25"}`}
                  />
                ))}
              </span>
              <span className="ml-1 inline-flex items-center gap-1 font-mono text-[13px] font-bold text-white">
                <Coin />
                {(funds ?? 0).toLocaleString("en-US")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
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
  const viewerFaction = factionOf(matchView, matchView.viewerPlayerId);
  const opponentFaction = matchView.opponent
    ? factionOf(matchView, matchView.opponent.playerId)
    : null;
  const deadline =
    now === null
      ? null
      : formatCountdown(matchView.turnDeadlineAt, new Date(now));
  const selectedFaction = selectedUnit
    ? factionOf(matchView, selectedUnit.ownerPlayerId)
    : null;
  const SelectedIcon = selectedFaction ? FACTION_ICON[selectedFaction] : null;

  return (
    <>
      {/* Top bar — commander cards flank the day pill. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        {viewerFaction ? (
          <PlayerCard
            faction={viewerFaction}
            turnLabel={yourTurn ? "Your turn" : null}
            deadline={null}
            funds={matchView.you?.funds ?? 0}
            powerMeter={matchView.you?.powerMeter ?? 0}
          />
        ) : (
          <div />
        )}

        <div
          className={`pointer-events-auto rounded-2xl border-[3px] bg-[#fff6e0] px-5 py-1.5 text-center ${NAVY} ${RAISED}`}
        >
          <div className="font-mono text-xl font-extrabold uppercase tracking-wide text-[#1c2b45]">
            Day {matchView.currentDay}
          </div>
          <div className="text-[10px] font-bold text-[#8a7a4a]">
            {deadline ?? "—"}
          </div>
        </div>

        {opponentFaction ? (
          <PlayerCard
            faction={opponentFaction}
            turnLabel={!yourTurn ? "Opponent's turn" : null}
            deadline={null}
            mirror
          />
        ) : (
          <div />
        )}
      </div>

      {/* Left column — terrain + selected-unit read-outs (cream cards). */}
      <div className="pointer-events-none absolute left-4 top-28 flex flex-col gap-3">
        {terrain && (
          <div
            className={`pointer-events-auto self-start rounded-xl border-[3px] bg-[#fff6e0] px-4 py-2 ${NAVY} ${RAISED}`}
          >
            <span className="font-display font-bold text-[#1c2b45]">
              {terrain.name}
            </span>
            <span className="ml-3 font-mono text-sm text-[#c58a1a]">
              Def {"★".repeat(terrain.defenseStars) || "0"}
            </span>
          </div>
        )}

        {selectedUnit && (
          <div
            className={`pointer-events-auto w-72 self-start overflow-hidden rounded-2xl border-[3px] bg-[#e9e2cd] ${NAVY} ${RAISED}`}
          >
            {/* Header — sprite, name, faction · movement, and the HP bar. */}
            <div className="flex items-center gap-3 p-3">
              <div
                className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border-2 ${NAVY} ${selectedFaction ? FACTION_BG[selectedFaction] : "bg-white"}`}
              >
                {selectedUnit.sprite ? (
                  <PixelSprite sprite={selectedUnit.sprite} scale={2} />
                ) : SelectedIcon ? (
                  <SelectedIcon
                    className="size-6 text-white"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-extrabold leading-tight text-[#1c2b45]">
                  {titleCase(selectedUnit.typeId)}
                </div>
                <div className="text-xs font-bold text-[#7a6f57]">
                  {selectedFaction ? titleCase(selectedFaction) : "—"} ·{" "}
                  {titleCase(selectedUnit.movementType)}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#1c2b45]/40 bg-[#1c2b45]/15">
                    <div
                      className="h-full rounded-full bg-gradient-to-b from-[#5fd07f] to-[#3fae5e]"
                      style={{
                        width: `${Math.max(0, Math.min(100, (selectedUnit.trueHp / (selectedUnit.maxHp || 100)) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold text-[#1c2b45]">
                    {displayHp(selectedUnit.trueHp)}/10
                  </span>
                </div>
              </div>
            </div>

            {/* Stats row — fuel, ammo, move, terrain defense. */}
            <div className={`grid grid-cols-4 border-t-2 text-center ${NAVY}`}>
              <Stat label="Fuel">{selectedUnit.fuel}</Stat>
              <Stat label="Ammo" divider>
                {selectedUnit.ammo}
              </Stat>
              <Stat label="Move" divider>
                {selectedUnit.movePoints}
              </Stat>
              <Stat label="Def" divider>
                <Stars n={selectedUnit.terrain?.defenseStars ?? 0} />
              </Stat>
            </div>

            {/* Footer — the terrain the unit stands on. */}
            {selectedUnit.terrain && (
              <div
                className={`flex items-center gap-2 border-t-2 px-3 py-2 ${NAVY}`}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#7a6f57]">
                  Terrain
                </span>
                <span className="font-display text-sm font-bold text-[#1c2b45]">
                  {selectedUnit.terrain.name}
                </span>
                <Stars n={selectedUnit.terrain.defenseStars} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
