"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError, apiClient, type MatchStatus } from "@/app/lib/api-client";
import { Button } from "@/app/components/ui/button";
import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import { useLiveSync } from "@/app/lib/sync/use-live-sync";
import { cn } from "@/app/lib/utils";

/**
 * Ready check (M9-T6, redesigned to the mockup's ready-check screen —
 * `Iron Grid.dc.html` → READY CHECK, `design-reference.md` §5).
 *
 * The design's anatomy: a centred heading with the match's settings line, one
 * raised row per seat — insignia tile, "Commander — <colour>" with "(you)" on
 * the caller's, a ready/waiting status line and a check-or-pulse marker — then a
 * full-width confirm button and the async-friendly footnote.
 *
 * The player confirms readiness (`POST …/ready`). The server reflects the
 * transition: `ready_check` while it waits on the opponent, `active` once both
 * have confirmed — at which point the match has started and the battlefield
 * (M10) is the next stop. Seats are server-rendered and then kept live by
 * `useLiveSync` (M11-T1): the opponent choosing a commander, confirming, or the
 * activation itself land here without a reload, and the loop stops once active.
 *
 * The mockup's "✓ You are ready — cancel?" button is rendered as a plain
 * confirmed state: there is no un-ready endpoint (readiness is one-way until the
 * match activates), so offering a cancel would promise something the API cannot
 * do.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

/** One seat as the screen shows it. */
export interface ReadySeat {
  readonly playerId: string;
  /** `null` before commander selection — the row falls back to neutral copy. */
  readonly faction: FactionId | null;
  readonly isReady: boolean;
  /** The caller's own seat, marked "(you)". */
  readonly isViewer: boolean;
}

/** The settings line under the heading, pre-formatted by the server. */
export interface ReadyMatchSummary {
  readonly mapName: string;
  readonly turnLength: string;
  readonly fogEnabled: boolean;
}

/** The mockup's insignia-tile paint per faction (`FAC`). */
const FACTION_TILE: Record<FactionId, string> = {
  blue: "bg-faction-blue",
  green: "bg-faction-green",
  red: "bg-faction-red",
  yellow: "bg-faction-yellow",
};

/** Neutral colour words — faction and commander names are gated (§33.1). */
const FACTION_LABEL: Record<FactionId, string> = {
  blue: "Blue",
  green: "Green",
  red: "Red",
  yellow: "Yellow",
};

function seatLabel(seat: ReadySeat): string {
  return seat.faction === null
    ? "Commander"
    : `Commander — ${FACTION_LABEL[seat.faction]}`;
}

function SeatRow({ seat }: { seat: ReadySeat }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3.5 rounded-2xl border-[3px] px-4.5 py-4",
        seat.isReady
          ? "border-success bg-success/12 shadow-[0_4px_0_rgba(31,138,76,0.22)]"
          : "border-[#1c2b45] bg-card shadow-[0_5px_0_rgba(28,43,69,0.26)]",
      )}
    >
      <span
        className={cn(
          "flex size-11.5 shrink-0 items-center justify-center rounded-xl border-[3px] border-[#1c2b45] text-white",
          seat.faction === null ? "bg-muted" : FACTION_TILE[seat.faction],
        )}
      >
        {seat.faction !== null && (
          <FactionBadge
            faction={seat.faction}
            showLabel={false}
            className="text-white [&_svg]:size-5"
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-extrabold text-foreground">
          {seatLabel(seat)}
          {seat.isViewer && (
            <span className="ml-1.5 text-[11px] font-bold text-muted-foreground">
              (you)
            </span>
          )}
        </span>
        <span
          className={cn(
            "mt-0.5 text-xs font-bold",
            seat.isReady ? "text-success" : "text-muted-foreground",
          )}
        >
          {seat.isReady
            ? "Ready"
            : seat.faction === null
              ? "Choosing a commander…"
              : seat.isViewer
                ? "Not ready yet"
                : "Waiting for your opponent to confirm…"}
        </span>
      </span>

      {seat.isReady ? (
        <span className="flex size-7.5 shrink-0 items-center justify-center rounded-full border-2 border-[#1c2b45] bg-success text-white">
          <Check className="size-4" strokeWidth={3.5} aria-hidden="true" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex size-7.5 shrink-0 items-center justify-center rounded-full border-[3px] border-border motion-safe:animate-pulse"
        >
          <span className="size-2 rounded-full bg-gold" />
        </span>
      )}
    </li>
  );
}

/** Whether a polled seat list is materially the same as the rendered one. */
function sameSeats(a: readonly ReadySeat[], b: readonly ReadySeat[]): boolean {
  return (
    a.length === b.length &&
    a.every((seat, i) => {
      const other = b[i];
      return (
        seat.playerId === other.playerId &&
        seat.faction === other.faction &&
        seat.isReady === other.isReady
      );
    })
  );
}

/**
 * Statuses with nothing left to watch for. Polling past any of them would leave
 * an abandoned tab asking a question that can no longer change its answer — a
 * cancelled match is as final here as an activated one.
 */
const STOPPED_STATUSES: readonly MatchStatus[] = [
  "active",
  "completed",
  "cancelled",
];

export function ReadyCheck({
  matchId,
  seats: initialSeats = [],
  summary,
  isActive = false,
}: {
  matchId: string;
  seats?: readonly ReadySeat[];
  summary?: ReadyMatchSummary;
  /** True once the match status is `active` — both seats confirmed. */
  isActive?: boolean;
}) {
  const [seats, setSeats] = useState<readonly ReadySeat[]>(initialSeats);
  /**
   * The match's own status, distinct from whether *this* player has confirmed.
   * A match that activated while the player was away (the opponent confirmed
   * last) reads identically on the caller's `is_ready` flag, so only the status
   * can tell the two apart.
   */
  const [status, setStatus] = useState<MatchStatus>(
    isActive ? "active" : "ready_check",
  );
  const [confirmed, setConfirmed] = useState(
    isActive || initialSeats.some((seat) => seat.isViewer && seat.isReady),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Bumped by every local mutation, so a stale poll can recognise itself. */
  const localWriteRef = useRef(0);
  // Read by the poll callback, which must compare against the current seats
  // without re-arming the sync loop on every render.
  const seatsRef = useRef(seats);
  useEffect(() => {
    seatsRef.current = seats;
  });

  async function ready() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.readyUp(matchId);
      const active = result.status === "active";
      // Any poll already in flight was issued against the pre-confirmation
      // server and would un-tick the seat this call just confirmed.
      localWriteRef.current += 1;
      setConfirmed(true);
      if (active) setStatus("active");
      // Only the caller's own seat is known to have changed; `active` means the
      // server saw both, so every seat is ready.
      setSeats((current) =>
        current.map((seat) =>
          active || seat.isViewer ? { ...seat, isReady: true } : seat,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? "Could not confirm. Try again."
          : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Watch for the other seat: the opponent choosing a commander, confirming, or
   * the activation that follows. Nothing here is optimistic — the server's
   * answer replaces local state outright.
   *
   * The loop stops on any terminal status, not just activation: a ready check
   * the host cancels, or one the opponent simply abandons, must not leave the
   * tab asking forever.
   */
  useLiveSync({
    enabled: !STOPPED_STATUSES.includes(status),
    poll: async () => {
      const issuedAt = localWriteRef.current;
      const live = await apiClient.getReadyState(matchId);
      // A confirmation landed while this was in flight: its answer is older than
      // what the player has already been shown, so drop it rather than let it
      // un-tick their own seat. The next tick reads the settled truth.
      if (issuedAt !== localWriteRef.current) return true;

      const next: ReadySeat[] = live.seats.map((seat) => ({
        playerId: seat.playerId,
        faction: (seat.factionId as FactionId | null) ?? null,
        isReady: seat.isReady,
        isViewer: seat.isViewer,
      }));
      const changed = !sameSeats(seatsRef.current, next);
      if (changed) setSeats(next);
      if (live.status !== status) {
        setStatus(live.status);
        return true;
      }
      return changed;
    },
  });

  const started = status === "active";
  // Readiness only opens once both seats hold a commander — the server rejects
  // it as an invalid transition before that, so the button waits instead.
  const awaitingCommander = seats.some((seat) => seat.faction === null);

  return (
    <div className="w-full max-w-[540px]">
      <div className="text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          {started ? "The match has begun" : "Ready check"}
        </h1>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {summary && (
            <>
              {summary.mapName} · {summary.turnLength} turns · Fog of war{" "}
              {summary.fogEnabled ? "ON" : "OFF"}
              <br />
            </>
          )}
          {started
            ? "Both players are ready."
            : awaitingCommander
              ? "Your commander is locked in. The ready check opens once your opponent has chosen theirs."
              : "The match starts the moment both players are ready."}
        </p>
      </div>

      {seats.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {seats.map((seat) => (
            <SeatRow key={seat.playerId} seat={seat} />
          ))}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 text-center text-sm font-bold text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-5">
        {started ? (
          <Button asChild size="lg" className="w-full">
            <Link href={`/matches/${matchId}/play`}>Enter the battlefield</Link>
          </Button>
        ) : (
          <Button
            size="lg"
            variant={confirmed ? "secondary" : "default"}
            className="w-full"
            onClick={() => void ready()}
            disabled={submitting || confirmed || awaitingCommander}
          >
            {confirmed ? (
              <>
                <Check
                  className="size-4"
                  strokeWidth={3.5}
                  aria-hidden="true"
                />
                You are ready
              </>
            ) : awaitingCommander ? (
              "Waiting for your opponent's commander"
            ) : submitting ? (
              "Confirming…"
            ) : (
              "I'm ready"
            )}
          </Button>
        )}
      </div>

      <p className="mt-3.5 text-center text-[11px] font-semibold text-muted-foreground">
        {confirmed && !started
          ? "You're ready. This page updates itself the moment your opponent confirms — or close the tab and we'll notify you."
          : "Async-friendly: you can close the tab. We'll notify you when the match begins."}
      </p>
    </div>
  );
}
