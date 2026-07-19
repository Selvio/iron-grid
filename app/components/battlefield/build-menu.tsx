"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, Plane, Ship, Truck } from "lucide-react";

import { playSfx } from "@/app/lib/audio/sfx";
import type { ProductionOption, UnitStats } from "@/app/lib/preview/actions";

import { AtlasSprite, PixelSprite } from "./pixel-sprite";
import { useDialogFocus } from "./use-dialog-focus";
import { formatFunds } from "@/app/lib/format";

/**
 * The Advance-Wars build popup (M10-T6, Claude Design mockup).
 *
 * A screen-centred modal over a dimmed battlefield: the buildable roster on the
 * left (sprite · name · price, unaffordable rows greyed) and an INTEL panel on
 * the right showing the highlighted unit's move/vision/gas, weapon slots and
 * domain — the same read-out Advance Wars shows before committing. Selecting a
 * row only moves the highlight; production commits on the Build button (no undo,
 * `game-specification.md` §10.4).
 *
 * @see docs/05-design/Iron Grid.dc.html (BUILD POPUP)
 */

/** One `Move 3` style stat line in the intel panel. */
function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[#8a5a2a]" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 font-display text-sm font-extrabold text-[#7a5a2a]">
        {label}
      </span>
      <span className="font-mono text-xl font-extrabold text-[#3a2f18]">
        {value}
      </span>
    </div>
  );
}

/** A `WEAPON 1 / M Gun` slot card. */
function WeaponSlot({
  slot,
  name,
  ammo,
}: {
  slot: string;
  name: string | null;
  ammo?: string;
}) {
  return (
    <div className="rounded-xl border-[3px] border-[#1c2b45] bg-[#f4e2ba] px-3 py-2">
      <div className="font-display text-[11px] font-extrabold tracking-wider text-[#a8894a]">
        {slot}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg font-extrabold text-[#3a2f18]">
          {name ?? "None"}
        </span>
        {name !== null && ammo !== undefined && (
          <span className="font-mono text-sm font-extrabold text-[#7a5a2a]">
            ×{ammo}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The unit's domain as a single badge — Land / Air / Sea with its movement
 * class. Only the domain the unit actually belongs to is shown: a base builds
 * nothing but ground units, so a permanently greyed-out "Air" pill next to it
 * read as a broken toggle.
 */
function DomainBadge({
  domain,
  mobility,
  mobilityKey,
}: {
  domain: UnitStats["domain"];
  mobility: string;
  /** The pack's own word label for the movement class, when it has one. */
  mobilityKey: string | null;
}) {
  const { label, Icon, header, body, text } = {
    ground: {
      label: "Land",
      Icon: Truck,
      header: "bg-[#c9a460] text-[#3a2f18]",
      body: "bg-[#f4e2ba]",
      text: "text-[#7a5a2a]",
    },
    air: {
      label: "Air",
      Icon: Plane,
      header: "bg-[#3f6fb0] text-white",
      body: "bg-[#dbe7f7]",
      text: "text-[#3f6fb0]",
    },
    naval: {
      label: "Sea",
      Icon: Ship,
      header: "bg-[#2f7fa8] text-white",
      body: "bg-[#d6ecf5]",
      text: "text-[#2f7fa8]",
    },
  }[domain];

  return (
    <div className="overflow-hidden rounded-xl border-[3px] border-[#1c2b45]">
      <div
        className={`border-b-2 border-[#1c2b45] p-0.5 text-center font-display text-xs font-extrabold ${header}`}
      >
        {label}
      </div>
      <div
        className={`flex items-center justify-center gap-2 px-1 py-2.5 font-display text-[13px] font-extrabold ${body} ${text}`}
      >
        <Icon className="size-4" aria-hidden="true" />
        {mobilityKey === null ? (
          mobility
        ) : (
          <AtlasSprite atlasKey={mobilityKey} scale={1} />
        )}
      </div>
    </div>
  );
}

export function BuildMenu({
  options,
  funds,
  onProduce,
  onCancel,
}: {
  options: readonly ProductionOption[];
  /** The viewer's funds, shown in the roster header. */
  funds: number;
  onProduce: (unitTypeId: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const option = options[selected] ?? options[0];
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, true);

  /** Commit the highlighted unit, with the confirmation blip. */
  function build(unitTypeId: string): void {
    playSfx("ui_confirm");
    onProduce(unitTypeId);
  }

  /** Move the highlight and take focus with it, so Enter builds what is shown. */
  function moveSelection(delta: number): void {
    const next = Math.min(options.length - 1, Math.max(0, selected + delta));
    setSelected(next);
    dialog.current
      ?.querySelector<HTMLButtonElement>(`[data-roster-index="${next}"]`)
      ?.focus();
  }

  // Escape backs out of the popup, as it does from every other menu state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (option === undefined) return null;
  const { stats } = option;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#0c1628]/50 p-6"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Build unit"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          // The roster is a list: arrows walk it, Enter commits the unit whose
          // intel is on screen. Without this the only way through eleven units
          // is eleven presses of Tab.
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && option?.affordable) {
            event.preventDefault();
            build(option.unitTypeId);
          }
        }}
        className="flex max-h-[92%] gap-4"
      >
        {/* Roster */}
        <div className="flex w-[372px] flex-col overflow-hidden rounded-[22px] border-[5px] border-[#1c2b45] bg-[#e7cfa0] shadow-[0_8px_0_rgba(28,43,69,0.35),inset_0_0_0_3px_#f4e2ba]">
          <div className="flex shrink-0 items-center gap-3 border-b-4 border-[#1c2b45] bg-gradient-to-b from-[#f2726d] to-[#d33f3a] px-3.5 py-3">
            <div className="flex flex-1 items-center gap-2.5 rounded-[20px] border-[3px] border-[#1c2b45] bg-[#f6d9b0] px-4 py-1.5 shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]">
              <span
                aria-hidden="true"
                className="grid size-[22px] place-items-center rounded-full border-2 border-[#b8860b] bg-[#ffd23c] text-[11px] font-extrabold text-[#8a6508]"
              >
                G
              </span>
              <span className="font-mono text-2xl font-extrabold tracking-wide text-[#3a2f18]">
                {funds.toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
            {options.map((o, index) => (
              <button
                key={o.unitTypeId}
                type="button"
                data-roster-index={index}
                tabIndex={index === selected ? 0 : -1}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                onDoubleClick={() =>
                  o.affordable ? build(o.unitTypeId) : undefined
                }
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 hover:bg-[#f0d69a] ${
                  index === selected ? "bg-[#f4dfa4]" : "bg-transparent"
                } ${o.affordable ? "" : "cursor-not-allowed"}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
                  <PixelSprite sprite={o.sprite} box={28} scale={2} />
                </span>
                <span
                  className={`flex-1 text-left font-display text-xl font-extrabold leading-none ${
                    o.affordable ? "text-[#3a2f18]" : "text-[#b0a074]"
                  }`}
                >
                  {o.displayName}
                </span>
                <span
                  className={`font-mono text-xl font-extrabold ${
                    o.affordable ? "text-[#3a2f18]" : "text-[#b0a074]"
                  }`}
                >
                  {o.cost.toLocaleString("en-US")}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Intel */}
        <div className="flex w-[340px] flex-col overflow-hidden rounded-[22px] border-[5px] border-[#1c2b45] bg-[#e7cfa0] shadow-[0_8px_0_rgba(28,43,69,0.35),inset_0_0_0_3px_#f4e2ba]">
          <div className="shrink-0 border-b-4 border-[#1c2b45] bg-gradient-to-b from-[#4a93f7] to-[#2f74dd] px-4 py-2.5">
            <span className="font-display text-xl font-extrabold tracking-[2px] text-white [text-shadow:0_2px_0_rgba(0,0,0,0.28)]">
              INTEL
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex gap-3.5">
              <div className="grid size-24 shrink-0 place-items-center rounded-2xl border-[3px] border-[#1c2b45] bg-[#f4e2ba] shadow-[inset_0_-4px_0_rgba(0,0,0,0.1)]">
                <PixelSprite sprite={option.sprite} box={80} scale={4} />
              </div>
              <div className="flex flex-1 flex-col gap-2 pt-0.5">
                <StatRow
                  icon={<ArrowRight className="size-5" />}
                  label="Move"
                  value={stats.move}
                />
                <StatRow
                  icon={<Eye className="size-5" />}
                  label="Vision"
                  value={stats.vision}
                />
                <StatRow
                  icon={<AtlasSprite atlasKey="hud_fuel" scale={2} />}
                  label="Gas"
                  value={stats.gas}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <WeaponSlot
                slot="WEAPON 1"
                name={stats.weapon1}
                ammo={stats.ammo === null ? "∞" : String(stats.ammo)}
              />
              <WeaponSlot slot="WEAPON 2" name={stats.weapon2} />
            </div>

            <div className="mt-4">
              <DomainBadge
                domain={stats.domain}
                mobility={stats.mobility}
                mobilityKey={stats.mobilityKey}
              />
            </div>
          </div>

          <div className="flex shrink-0 gap-2.5 border-t-4 border-[#1c2b45] bg-[#dcc190] px-3.5 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-[13px] border-[3px] border-[#1c2b45] bg-white px-4 py-3 font-display text-[15px] font-extrabold text-[#1c2b45] shadow-[0_4px_0_rgba(28,43,69,0.25)] active:translate-y-0.5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!option.affordable}
              onClick={() => build(option.unitTypeId)}
              className="flex flex-1 items-center justify-center gap-2 rounded-[13px] border-[3px] border-[#1c2b45] bg-gradient-to-b from-[#2ee0c8] to-[#1fb3a0] py-3 font-display text-base font-extrabold text-[#08201d] shadow-[0_4px_0_rgba(28,43,69,0.28)] active:translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#cdbb8a] disabled:bg-none disabled:text-[#8a7a4a]"
            >
              Build ·{" "}
              <span className="font-mono">{formatFunds(option.cost)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
