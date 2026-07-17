"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Plus } from "lucide-react";

import type { MatchSummary } from "@/app/lib/api-client";
import { formatCountdown } from "@/app/lib/format";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";

/**
 * Dashboard match list (M9-T4).
 *
 * Presentational and DOM-only so it renders under RTL with fixture rows. Groups
 * the caller's matches into "Your turn" / "Waiting on opponent" / "Setting up" /
 * "Finished" and shows a deadline countdown per active turn (`design-reference.md`
 * §5). The countdown clock is client-owned and ticks each minute; tests inject
 * a fixed `nowMs` for deterministic assertions.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4)
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
      return `/matches/${match.matchId}`;
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

const GROUP_ORDER: readonly { key: Group; heading: string }[] = [
  { key: "your-turn", heading: "Your turn" },
  { key: "waiting", heading: "Waiting on opponent" },
  { key: "setup", heading: "Setting up" },
  { key: "finished", heading: "Finished" },
];

function MatchRow({ match, now }: { match: MatchSummary; now: number | null }) {
  const showCountdown = match.status === "active";
  const href = matchHref(match);
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        {href ? (
          <Link href={href} className="font-medium hover:underline">
            {STATUS_LABEL[match.status]}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">
            {STATUS_LABEL[match.status]}
          </span>
        )}
        {showCountdown && (
          <span className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            {now === null
              ? "—"
              : formatCountdown(match.turnDeadlineAt, new Date(now))}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardList({
  matches,
  nowMs,
}: {
  matches: readonly MatchSummary[];
  /** A fixed clock for tests; omitted in production so the client ticks live. */
  nowMs?: number;
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
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-muted-foreground">
          No matches yet. Start one and invite an opponent.
        </p>
        <Button asChild>
          <Link href="/matches/new">
            <Plus className="size-4" aria-hidden="true" />
            Create match
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
    <div className="flex flex-col gap-8">
      {GROUP_ORDER.map(({ key, heading }) => {
        const rows = byGroup.get(key);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={key} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {heading}
            </h2>
            {rows.map((match) => (
              <MatchRow key={match.matchId} match={match} now={now} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
