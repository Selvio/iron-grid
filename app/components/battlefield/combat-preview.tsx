"use client";

import { displayHp } from "game-engine";
import { CircleAlert, Swords } from "lucide-react";

import type { FactionId } from "@/app/components/faction-badge";
import type { CombatDefender } from "@/app/lib/battlefield/machine";
import type { UnitSprite } from "@/app/lib/preview/actions";

import { PixelSprite } from "./pixel-sprite";

/**
 * The combat forecast, styled to the design mockup (`Iron Grid.dc.html` —
 * COMBAT PREVIEW): attacker and defender face each other across the damage the
 * engine predicts, over the terms of the trade — counter-damage, defence stars —
 * and the irreversible Attack.
 *
 * The numbers are the pure engine's preview with no luck drawn (§12.7), so they
 * are a forecast, not a promise; the server resolves the real thing, which is
 * what the footer says out loud.
 *
 * @see docs/05-design/Iron Grid.dc.html
 */

/** Attacker facts the forecast needs; the defender's arrive with the state. */
export interface CombatAttacker {
  readonly displayName: string;
  readonly trueHp: number;
  readonly faction: FactionId | null;
  readonly sprite: UnitSprite | null;
}

const FACTION_BAR: Record<FactionId, string> = {
  blue: "from-[#4a93f7] to-[#2f74dd]",
  red: "from-[#f2726d] to-[#d33f3a]",
  green: "from-[#63c76a] to-[#3f9e4a]",
  yellow: "from-[#f5c33b] to-[#d9a318]",
};

/** One side of the forecast: portrait, name, and who it is in this exchange. */
function Combatant({
  name,
  faction,
  sprite,
  role,
  trueHp,
}: {
  name: string;
  faction: FactionId | null;
  sprite: UnitSprite | null;
  role: "attacker" | "defender";
  trueHp: number;
}) {
  const gradient =
    faction === null
      ? "from-[#8d99ae] to-[#6b7688]"
      : (FACTION_BAR[faction] ?? "from-[#8d99ae] to-[#6b7688]");
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-1.5 bg-gradient-to-b px-3 py-4 text-center text-white ${gradient}`}
    >
      <PixelSprite sprite={sprite} box={40} scale={2} />
      <div className="font-display text-base font-extrabold">{name}</div>
      <div className="text-[10px] font-semibold uppercase opacity-90">
        {faction ?? "unknown"} · {role} · HP {displayHp(trueHp)}
      </div>
    </div>
  );
}

export function CombatPreviewPanel({
  attacker,
  defender,
  minDamage,
  maxDamage,
  counter,
  onConfirm,
  onCancel,
}: {
  attacker: CombatAttacker | null;
  defender: CombatDefender | undefined;
  minDamage: number;
  maxDamage: number;
  counter: { readonly minDamage: number; readonly maxDamage: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The forecast is in true HP against a 100-HP unit, so it already reads as a
  // percentage; the headline number is the display-HP the defender stands to
  // lose, which is the scale the rest of the board speaks in.
  const hpBefore = defender ? displayHp(defender.trueHp) : 0;
  const hpAfter = defender
    ? displayHp(Math.max(0, defender.trueHp - maxDamage))
    : 0;
  const lost = hpBefore - hpAfter;
  const spread = minDamage === maxDamage ? null : `${minDamage}–${maxDamage}%`;

  return (
    <div
      role="group"
      aria-label="Combat forecast"
      className="pointer-events-auto absolute left-1/2 top-24 z-30 w-[424px] -translate-x-1/2 overflow-hidden rounded-[20px] border-4 border-[#1c2b45] bg-[#fff6e0] shadow-[0_8px_0_rgba(28,43,69,0.35)]"
    >
      <div className="flex items-stretch">
        {attacker && (
          <Combatant
            name={attacker.displayName}
            faction={attacker.faction}
            sprite={attacker.sprite}
            role="attacker"
            trueHp={attacker.trueHp}
          />
        )}
        <div className="flex w-[126px] shrink-0 flex-col items-center justify-center px-1.5 py-2">
          <div className="font-display text-[9px] font-extrabold tracking-widest text-[#8a7a4a]">
            EST. DAMAGE
          </div>
          <div className="font-mono text-[46px] font-extrabold leading-none text-[#d33f3a] [text-shadow:0_2px_0_rgba(28,43,69,0.15)]">
            {lost}
          </div>
          <div className="font-display text-[11px] font-bold text-[#1c2b45]">
            HP {hpBefore} → {hpAfter}
          </div>
          {spread !== null && (
            <div className="mt-0.5 text-[9px] text-[#a99a6a]">
              range {spread}
            </div>
          )}
        </div>
        {defender && (
          <Combatant
            name={defender.displayName}
            faction={defender.faction}
            sprite={defender.sprite}
            role="defender"
            trueHp={defender.trueHp}
          />
        )}
      </div>

      <div className="border-t-[3px] border-[#1c2b45] px-3.5 py-2.5 text-[11px] text-[#7a6a3a]">
        <b className="text-[#1c2b45]">
          Counter{" "}
          {counter === null
            ? "none"
            : counter.minDamage === counter.maxDamage
              ? `−${counter.maxDamage}%`
              : `−${counter.minDamage}–${counter.maxDamage}%`}
        </b>
        {defender && (
          <>
            {" · defender terrain "}
            {defender.terrainName ?? "unknown"}{" "}
            <span className="text-[#e8a417]">
              {"★".repeat(defender.stars)}
              {"☆".repeat(Math.max(0, 4 - defender.stars))}
            </span>
          </>
        )}
      </div>

      <div className="flex gap-2.5 px-3.5 pb-3.5">
        <button
          type="button"
          onClick={onConfirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-[3px] border-[#1c2b45] bg-[#d33f3a] py-3 font-display text-[15px] font-extrabold text-white shadow-[0_4px_0_rgba(28,43,69,0.3)] transition-[filter] hover:brightness-105 active:translate-y-0.5"
        >
          <Swords className="size-4" strokeWidth={2.4} aria-hidden />
          Attack
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-xl border-[3px] border-[#1c2b45] bg-white px-4 py-3 font-display text-[15px] font-extrabold text-[#1c2b45] shadow-[0_4px_0_rgba(28,43,69,0.25)] active:translate-y-0.5"
        >
          Cancel
        </button>
      </div>

      <p className="flex items-center gap-1.5 px-3.5 pb-3 text-[10px] text-[#a99a6a]">
        <CircleAlert className="size-3 shrink-0" aria-hidden />
        Server-resolved · no undo once confirmed
      </p>
    </div>
  );
}
