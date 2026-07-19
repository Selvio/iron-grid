"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Map as MapIcon, Plus } from "lucide-react";

import type { MatchSummary } from "@/app/lib/api-client";
import { formatCountdown, formatMapName } from "@/app/lib/format";
import { Button } from "@/app/components/ui/button";
import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import { MapThumbnail, type MapPreview } from "@/app/components/map-thumbnail";
import { cn } from "@/app/lib/utils";

/**
 * Dashboard match list (M9-T4, redesigned in M9-T9).
 *
 * Presentational and DOM-only so it renders under RTL with fixture rows. Groups
 * the caller's matches into "Your turn" / "Waiting on opponent" / "Setting up" /
 * "Finished" and renders the row anatomy of the match-dashboard screen in
 * `design-reference.md` §5: map tile, map name, a state pill, the
 * `vs <insignia> opponent · Day N · W×H` meta line, and a deadline readout —
 * live rows in card cream, rows that are not the caller's move visibly muted.
 *
 * The countdown clock is client-owned and ticks each minute; tests inject a
 * fixed `nowMs` for deterministic assertions.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4, M9-T9)
 */

const STATUS_LABEL: Record<MatchSummary["status"], string> = {
  draft: "Draft",
  waiting_for_opponent: "Waiting for opponent",
  commander_selection: "Choosing commanders",
  ready_check: "Ready check",
  active: "In play",
  completed: "Completed",
  cancelled: "Cancelled",
};

const FACTION_IDS: readonly string[] = ["blue", "green", "red", "yellow"];

/** Narrows the server's open `factionId` string to a renderable faction. */
function asFaction(factionId: string | null): FactionId | null {
  return factionId !== null && FACTION_IDS.includes(factionId)
    ? (factionId as FactionId)
    : null;
}

/** The official maps a row may need to draw, keyed by map id. */
export type MapPreviews = Readonly<Record<string, MapPreview>>;

/** The screen a row links to, or `null` when the status has no M9 destination. */
function matchHref(match: MatchSummary): string | null {
  switch (match.status) {
    case "commander_selection":
      return `/matches/${match.matchId}/commander`;
    case "ready_check":
      return `/matches/${match.matchId}/ready`;
    case "completed":
      return `/matches/${match.matchId}/completed`;
    case "active":
      // The battlefield is M10; the row links forward to it.
      return `/matches/${match.matchId}/play`;
    default:
      // draft / waiting_for_opponent / cancelled have no M9 screen yet.
      return null;
  }
}

type Group = "your-turn" | "waiting" | "setup" | "finished";

function groupOf(match: MatchSummary): Group {
  if (match.status === "completed" || match.status === "cancelled") {
    return "finished";
  }
  if (match.status === "active") {
    return match.activePlayerId === match.viewerPlayerId
      ? "your-turn"
      : "waiting";
  }
  return "setup";
}

const GROUP_ORDER: readonly {
  key: Group;
  heading: string;
  /** The design marks the actionable group with a filled teal dot (§5). */
  live: boolean;
}[] = [
  { key: "your-turn", heading: "Your turn — act now", live: true },
  { key: "waiting", heading: "Waiting on opponent", live: false },
  { key: "setup", heading: "Setting up", live: false },
  { key: "finished", heading: "Finished", live: false },
];

/** The opponent's identity: insignia plus name, never color alone (§27.4). */
function OpponentTag({ match }: { match: MatchSummary }) {
  if (match.opponent === null) {
    return <span>No opponent yet</span>;
  }
  const faction = asFaction(match.opponent.factionId);
  const name = match.opponent.name ?? "Opponent";
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true">vs</span>
      {faction !== null && <FactionBadge faction={faction} showLabel={false} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

function MatchRow({
  match,
  now,
  live,
  mapPreviews,
}: {
  match: MatchSummary;
  now: number | null;
  /** True for the caller's own turn — the design's cream, raised card. */
  live: boolean;
  mapPreviews: MapPreviews;
}) {
  const href = matchHref(match);
  const preview = mapPreviews[match.mapId];
  const showCountdown = match.status === "active";
  const countdown =
    now === null ? "—" : formatCountdown(match.turnDeadlineAt, new Date(now));

  const body = (
    <>
      <span
        className={cn(
          "flex w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2",
          live
            ? "border-[#1c2b45] bg-secondary text-[#1c2b45]"
            : "border-border bg-muted text-muted-foreground",
          // A map the catalogue no longer has still needs a square tile.
          preview === undefined && "size-12",
        )}
      >
        {preview === undefined ? (
          <MapIcon className="size-5" aria-hidden="true" />
        ) : (
          <MapThumbnail map={preview} className="w-full" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display truncate text-base font-bold">
            {formatMapName(match.mapId)}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
              live
                ? "border-[#1c2b45] bg-faction-yellow text-[#1c2b45]"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {live ? "Your turn" : STATUS_LABEL[match.status]}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-semibold text-muted-foreground">
          <OpponentTag match={match} />
          {match.day > 0 && <span className="font-mono">Day {match.day}</span>}
          {preview !== undefined && (
            <span className="font-mono">
              {preview.width}×{preview.height}
            </span>
          )}
        </span>
      </span>

      {showCountdown && (
        <span className="shrink-0 text-right">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {live ? "Deadline" : "Their deadline"}
          </span>
          <span
            className={cn(
              "block font-mono text-sm font-bold",
              live ? "text-gold" : "text-muted-foreground",
            )}
          >
            {countdown}
          </span>
        </span>
      )}

      {href !== null && (
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </>
  );

  const shell = cn(
    "flex items-center gap-4 rounded-2xl border-2 p-4 text-left",
    live
      ? "border-[#1c2b45] bg-card text-card-foreground shadow-[0_4px_0_rgba(28,43,69,0.16)]"
      : "border-border bg-muted/40 text-muted-foreground shadow-[0_3px_0_rgba(28,43,69,0.08)]",
  );

  if (href === null) {
    return <div className={shell}>{body}</div>;
  }
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "transition-[filter,transform] hover:brightness-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:active:translate-y-0.5",
      )}
    >
      {body}
    </Link>
  );
}

export function DashboardList({
  matches,
  nowMs,
  mapPreviews = {},
}: {
  matches: readonly MatchSummary[];
  /** A fixed clock for tests; omitted in production so the client ticks live. */
  nowMs?: number;
  /** The official maps, keyed by id, from the server's game data. */
  mapPreviews?: MapPreviews;
}) {
  const [now, setNow] = useState<number | null>(nowMs ?? null);
  useEffect(() => {
    if (nowMs !== undefined) return;
    // Seed the clock after paint (async, so no synchronous set-in-effect) and
    // tick each minute thereafter.
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [nowMs]);

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border py-16 text-center">
        <p className="text-muted-foreground">
          No matches yet. Start one and invite an opponent.
        </p>
        <Button asChild>
          <Link href="/matches/new">
            <Plus className="size-4" aria-hidden="true" />
            New match
          </Link>
        </Button>
      </div>
    );
  }

  const byGroup = new Map<Group, MatchSummary[]>();
  for (const match of matches) {
    const group = groupOf(match);
    (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push(match);
  }

  return (
    <div className="flex flex-col gap-7">
      {GROUP_ORDER.map(({ key, heading, live }) => {
        const rows = byGroup.get(key);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={key} className="flex flex-col gap-3">
            <h2
              className={cn(
                "flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest",
                live ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  live
                    ? "bg-primary"
                    : "border-2 border-current bg-transparent",
                )}
              />
              {heading}
            </h2>
            {rows.map((match) => (
              <MatchRow
                key={match.matchId}
                match={match}
                now={now}
                live={live}
                mapPreviews={mapPreviews}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
