"use client";

import { Check, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FactionId } from "@/app/components/faction-badge";
import { FactionBadge } from "@/app/components/faction-badge";
import { ApiError, apiClient } from "@/app/lib/api-client";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

/**
 * Commander selection (M9-T6, redesigned to the mockup's commander-select
 * screen — `design-reference.md` §5).
 *
 * Four factions/commanders with **placeholder** identity — commander and faction
 * names are design-blocked (§33.1), so each card is its faction insignia (color
 * *and* silhouette) plus the neutral label "Commander", never an invented name.
 * The design's PASSIVE / CO POWER panels are deliberately not filled with
 * invented traits; the card says the traits are pending instead.
 *
 * The flow follows the design: picking a card only highlights it, and a separate
 * "Lock in" confirms — the client's no-undo confirmation rule (`frontend.md` §6,
 * `game-specification.md` §10.4). The server owns uniqueness
 * (`duplicate_faction_selection_allowed: false`): a taken faction comes back as a
 * typed error, surfaced for a retry. When the server reports `ready_check` (both
 * chosen) the player is routed to the ready check.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

export interface CommanderOption {
  readonly id: string;
  readonly faction: FactionId;
}

/**
 * The mockup's faction paint (`Iron Grid.dc.html` → `FAC`): a banner gradient
 * from the faction color into its dark shade, and the glow the picked card gets.
 * Color never carries identity alone — `FactionBadge` supplies the silhouette.
 */
const FACTION_PAINT: Record<
  FactionId,
  { banner: string; border: string; glow: string }
> = {
  blue: {
    banner: "from-[#4f8ef7] to-[#2b5fbf]",
    border: "border-[#4f8ef7]",
    glow: "shadow-[0_10px_0_#2b5fbf,0_0_0_4px_rgba(79,142,247,0.48)]",
  },
  green: {
    banner: "from-[#37b26b] to-[#227a48]",
    border: "border-[#37b26b]",
    glow: "shadow-[0_10px_0_#227a48,0_0_0_4px_rgba(55,178,107,0.48)]",
  },
  red: {
    banner: "from-[#ef5b5b] to-[#b83636]",
    border: "border-[#ef5b5b]",
    glow: "shadow-[0_10px_0_#b83636,0_0_0_4px_rgba(239,91,91,0.48)]",
  },
  yellow: {
    banner: "from-[#e0a72e] to-[#a9781a]",
    border: "border-[#e0a72e]",
    glow: "shadow-[0_10px_0_#a9781a,0_0_0_4px_rgba(224,167,46,0.48)]",
  },
};

/** The neutral color word the whole screen labels a faction by (§33.1). */
const FACTION_LABEL: Record<FactionId, string> = {
  blue: "Blue",
  green: "Green",
  red: "Red",
  yellow: "Yellow",
};

export function CommanderSelect({
  matchId,
  commanders,
}: {
  matchId: string;
  commanders: readonly CommanderOption[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<CommanderOption | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedFaction, setSelectedFaction] = useState<FactionId | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function lockIn(option: CommanderOption) {
    setPending(true);
    setError(null);
    try {
      const result = await apiClient.selectCommander(matchId, option.id);
      setSelectedFaction(option.faction);
      if (result.status === "ready_check") {
        router.push(`/matches/${matchId}/ready`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "commander_unavailable"
          ? "That faction is taken. Choose another."
          : "Something went wrong. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (selectedFaction) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">You chose</p>
        <FactionBadge faction={selectedFaction} className="text-lg" />
        <p className="text-sm text-muted-foreground">
          Waiting for your opponent to choose. Refresh to check for the ready
          check.
        </p>
        <Button variant="outline" asChild>
          <a href={`/matches/${matchId}/ready`}>Go to ready check</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Choose your commander
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
          One faction each. Colour is always paired with an insignia — never
          colour alone.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {commanders.map((option) => {
          const paint = FACTION_PAINT[option.faction];
          const isPicked = picked?.id === option.id;
          return (
            <button
              key={option.id}
              type="button"
              // The card's own name stays the placeholder identity; the trait
              // note below is descriptive text, not part of the choice.
              aria-label={`Commander — ${FACTION_LABEL[option.faction]}`}
              aria-pressed={isPicked}
              onClick={() => setPicked(option)}
              className={cn(
                "overflow-hidden rounded-2xl border-[3px] bg-card text-left transition-[transform,box-shadow,filter] hover:brightness-[1.03]",
                isPicked
                  ? cn(paint.border, paint.glow, "motion-safe:-translate-y-1.5")
                  : "border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.26)]",
              )}
            >
              <span
                className={cn(
                  "relative flex h-26 items-center justify-center border-b-[3px] border-[#1c2b45] bg-linear-135",
                  paint.banner,
                )}
              >
                {/* The mockup's diagonal banner hatching. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.10)_0_10px,transparent_10px_20px)]"
                />
                {/* Decorative here — the label under the banner names it. */}
                <span
                  aria-hidden="true"
                  className="relative flex size-15 items-center justify-center rounded-[15px] border-[3px] border-white bg-white/15 text-white shadow-[0_3px_0_rgba(0,0,0,0.28)]"
                >
                  <FactionBadge
                    faction={option.faction}
                    showLabel={false}
                    className="text-white [&_svg]:size-7"
                  />
                </span>
                {isPicked && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full border-2 border-[#1c2b45] bg-[#ffd23c] py-0.5 pl-1.5 pr-2 text-[9px] font-extrabold tracking-wide text-[#1c2b45]">
                    <Check className="size-3" strokeWidth={3.5} />
                    PICKED
                  </span>
                )}
              </span>

              <span className="flex flex-col gap-0.5 p-3.5">
                <span className="text-[15px] font-extrabold text-[#1c2b45]">
                  Commander
                </span>
                <FactionBadge
                  faction={option.faction}
                  className="text-[11px] font-extrabold uppercase tracking-wide"
                />
                {/* The design's PASSIVE / CO POWER panels stay empty on purpose:
                    commander traits are a design blocker (§33.1), and inventing
                    them here would make the mockup canon. */}
                <span className="mt-3 rounded-lg border-2 border-border bg-secondary px-2.5 py-2 text-[11px] font-semibold leading-snug text-muted-foreground">
                  Passive trait and CO power are still being designed.
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2.5 rounded-xl border-[3px] border-[#1c2b45] bg-card py-2 pl-2.5 pr-3.5 shadow-[0_4px_0_rgba(28,43,69,0.16)]">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[9px] border-2 border-[#1c2b45]",
              picked === null
                ? "bg-muted"
                : cn(
                    "bg-linear-135 text-white",
                    FACTION_PAINT[picked.faction].banner,
                  ),
            )}
          >
            {picked !== null && (
              <FactionBadge
                faction={picked.faction}
                showLabel={false}
                className="text-white"
              />
            )}
          </span>
          <span className="flex flex-col">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-gold">
              Selected
            </span>
            <span className="text-sm font-extrabold leading-tight text-[#1c2b45]">
              {picked === null
                ? "Pick a faction"
                : `Commander — ${FACTION_LABEL[picked.faction]}`}
            </span>
          </span>
        </span>

        <Button
          type="button"
          size="lg"
          disabled={picked === null || pending}
          onClick={() => picked !== null && void lockIn(picked)}
        >
          {pending
            ? "Locking in…"
            : picked === null
              ? "Lock in commander"
              : `Lock in Commander — ${FACTION_LABEL[picked.faction]}`}
          <ChevronRight className="size-4" strokeWidth={3} />
        </Button>
      </div>
    </div>
  );
}
