import type { CompletionReason } from "game-engine";
import { Flag, Trophy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import { cn } from "@/app/lib/utils";

/**
 * Completed-match summary (M9-T7, redesigned to the mockup's BATTLE RESULTS
 * screen — `Iron Grid.dc.html` → MATCH COMPLETED).
 *
 * The design's anatomy, minus what cannot honestly be filled: a hatched banner
 * in the winner's colours carrying their insignia, the outcome and chips for
 * how/where/how long, then a per-commander table of what each side did.
 *
 * **The design's score cards are deliberately not built.** SPEED / POWER /
 * TECHNIQUE, the `/100` bars and the rank letter are a scoring model whose
 * weights are an open blocker (`rules.yaml` → `day_limit_scoring`,
 * `game-specification.md` §23.4, §33.2) — inventing a formula to fill them would
 * make the mockup's placeholder numbers canon. The table below is counts of
 * things that provably happened, taken from the event log.
 *
 * The mockup's "Cmdr. Vega" / "Cmdr. Roth" are likewise not adopted: commander
 * names are blocked (§33.1), so a side is named by its faction colour and
 * insignia, as everywhere else in the app.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

export type { CompletionReason };

const REASON_TEXT: Record<CompletionReason, string> = {
  headquarters_captured: "Enemy HQ captured",
  army_eliminated: "Army eliminated",
  resignation: "Resignation",
  timeout_claimed: "Turn deadline expired",
  day_limit_score: "Day limit reached",
  administrative: "Ended by an administrator",
};

/** The mockup's faction paint for the banner (`FAC`). */
const FACTION_PAINT: Record<FactionId, { from: string; to: string }> = {
  blue: { from: "from-[#4f8ef7]", to: "to-[#2b5fbf]" },
  green: { from: "from-[#37b26b]", to: "to-[#227a48]" },
  red: { from: "from-[#ef5b5b]", to: "to-[#b83636]" },
  yellow: { from: "from-[#e0a72e]", to: "to-[#a9781a]" },
};

const FACTION_LABEL: Record<FactionId, string> = {
  blue: "Blue",
  green: "Green",
  red: "Red",
  yellow: "Yellow",
};

/** One side's row in the results table. */
export interface CompletedSeat {
  readonly playerId: string;
  readonly faction: FactionId | null;
  /**
   * Who the human is — display name, falling back to the magic-link email the
   * same way the dashboard row does (M9-T9). `null` only for a seat that was
   * never accepted.
   */
  readonly label: string | null;
  readonly isViewer: boolean;
  readonly isWinner: boolean;
  readonly unitsLost: number;
  readonly damageDealt: number;
  readonly captures: number;
  readonly unitsBuilt: number;
}

/** The chips under the banner title. */
export interface CompletedSummary {
  readonly mapName: string;
  readonly day: number;
  /** Activation → completion, pre-formatted; `null` when either is missing. */
  readonly duration: string | null;
}

const COLUMNS = [
  { key: "unitsLost", label: "Units lost" },
  { key: "damageDealt", label: "Damage dealt" },
  { key: "captures", label: "Captures" },
  { key: "unitsBuilt", label: "Units built" },
] as const;

function seatName(seat: CompletedSeat): string {
  return seat.faction === null
    ? "Commander"
    : `Commander — ${FACTION_LABEL[seat.faction]}`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border-2 border-[#1c2b45] bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-[#1c2b45]">
      {children}
    </span>
  );
}

export function MatchCompleted({
  viewerPlayerId,
  winnerPlayerId,
  completionReason,
  seats = [],
  summary,
}: {
  viewerPlayerId: string;
  winnerPlayerId: string | null;
  completionReason: CompletionReason | null;
  seats?: readonly CompletedSeat[];
  summary?: CompletedSummary;
}) {
  const won = winnerPlayerId !== null && winnerPlayerId === viewerPlayerId;
  const winner = seats.find((seat) => seat.isWinner);
  const paint = winner?.faction ? FACTION_PAINT[winner.faction] : null;

  return (
    <div className="w-full max-w-3xl">
      <div
        className={cn(
          "relative overflow-hidden rounded-[22px] border-4 border-[#1c2b45] shadow-[0_8px_0_rgba(28,43,69,0.3)]",
          paint === null
            ? "bg-muted"
            : cn("bg-linear-160 text-white", paint.from, paint.to),
        )}
      >
        {/* The mockup's diagonal banner hatching. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.10)_0_14px,transparent_14px_28px)]"
        />
        <div className="relative flex flex-wrap items-center gap-4 px-6 py-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-white bg-white/15 shadow-[0_3px_0_rgba(0,0,0,0.28)]">
            {won ? (
              <Trophy className="size-8 text-white" aria-hidden="true" />
            ) : (
              <Flag className="size-8 text-white" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold tracking-[0.2em] text-[#08322c]">
              {winnerPlayerId === null
                ? "BATTLE RESULTS"
                : won
                  ? "VICTORY"
                  : "DEFEAT"}
            </p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white [text-shadow:0_3px_0_rgba(0,0,0,0.22)]">
              {winner === undefined || winner.faction === null
                ? "Match ended"
                : `${FACTION_LABEL[winner.faction]} Army wins`}
            </h1>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {completionReason !== null && (
                <Chip>{REASON_TEXT[completionReason]}</Chip>
              )}
              {summary && <Chip>{summary.mapName}</Chip>}
              {summary && (
                <Chip>
                  Day {summary.day}
                  {summary.duration !== null && ` · ${summary.duration}`}
                </Chip>
              )}
            </div>
          </div>
        </div>
      </div>

      {seats.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border-[3px] border-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.26)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center">
              <caption className="sr-only">
                What each commander did over the match
              </caption>
              <thead>
                <tr className="bg-[#1c2b45] text-white">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider"
                  >
                    Commander
                  </th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="px-4 py-3 text-[11px] font-extrabold uppercase tracking-wider"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seats.map((seat) => (
                  <tr
                    key={seat.playerId}
                    className={cn(
                      "border-t-[3px] border-[#1c2b45]",
                      seat.isWinner ? "bg-card" : "bg-[#fbeeee]",
                    )}
                  >
                    <th scope="row" className="px-4 py-3 text-left">
                      <span className="flex items-center gap-2.5">
                        {seat.faction !== null && (
                          <FactionBadge
                            faction={seat.faction}
                            showLabel={false}
                            className="[&_svg]:size-5"
                          />
                        )}
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="text-sm font-extrabold text-[#1c2b45]">
                            {seatName(seat)}
                            {seat.isViewer && (
                              <span className="ml-1.5 text-[11px] font-bold text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </span>
                          {seat.label !== null && (
                            <span
                              className="max-w-[22ch] truncate text-[11px] font-semibold text-muted-foreground"
                              title={seat.label}
                            >
                              {seat.label}
                            </span>
                          )}
                          <span
                            className={cn(
                              "mt-0.5 rounded-full border-2 border-[#1c2b45] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1c2b45]",
                              seat.isWinner ? "bg-[#ffd23c]" : "bg-[#e9dede]",
                            )}
                          >
                            {seat.isWinner ? "Winner" : "Defeated"}
                          </span>
                        </span>
                      </span>
                    </th>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className="px-4 py-3 font-mono text-base font-extrabold text-[#1c2b45]"
                      >
                        {seat[column.key].toLocaleString("en-US")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button asChild size="lg" className="w-full">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
