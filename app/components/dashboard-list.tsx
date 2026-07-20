"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Copy,
  Link2,
  LogIn,
  Map as MapIcon,
  Plus,
  Trash2,
} from "lucide-react";

import { apiClient, type MatchSummary } from "@/app/lib/api-client";
import { formatCountdown, formatMapName } from "@/app/lib/format";
import { Button } from "@/app/components/ui/button";
import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import { MapThumbnail, type MapPreview } from "@/app/components/map-thumbnail";
import { useLiveSync } from "@/app/lib/sync/use-live-sync";
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

/**
 * Whether a polled list is the same as the rendered one, by the fields the row
 * actually draws. Comparing here (rather than always replacing) keeps the sync
 * loop backing off while nothing is happening.
 */
function sameRows(
  a: readonly MatchSummary[],
  b: readonly MatchSummary[],
): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => {
      const other = b[i];
      return (
        row.matchId === other.matchId &&
        row.status === other.status &&
        row.activePlayerId === other.activePlayerId &&
        row.turnDeadlineAt === other.turnDeadlineAt &&
        row.day === other.day &&
        row.opponent?.factionId === other.opponent?.factionId &&
        row.opponent?.name === other.opponent?.name
      );
    })
  );
}

const STATUS_LABEL: Record<MatchSummary["status"], string> = {
  draft: "Draft",
  waiting_for_opponent: "Waiting for opponent",
  commander_selection: "Choosing commanders",
  ready_check: "Ready check",
  active: "In play",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * The statuses a match may still be discarded from — the server's own
 * cancellable set (`app/server/lifecycle/cancel.ts`, `domain-model.md` §6.1).
 * Once a match is active it is resignation, not cancellation.
 */
const CANCELLABLE_STATUSES: readonly MatchSummary["status"][] = [
  "draft",
  "waiting_for_opponent",
  "commander_selection",
  "ready_check",
];

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

/** The opponent's identity: insignia plus name (or email), never color alone (§27.4). */
function OpponentTag({ match }: { match: MatchSummary }) {
  if (match.opponent === null) {
    return <span>No opponent yet</span>;
  }
  const faction = asFaction(match.opponent.factionId);
  const label = match.opponent.name ?? match.opponent.email;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true">vs</span>
      {faction !== null && <FactionBadge faction={faction} showLabel={false} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * The host's invitation, re-surfaced on the row (the "Invite an opponent" card
 * of `design-reference.md` §5, folded into the dashboard): the code in a dashed
 * cream field, plus copy actions for the code and the shareable join link.
 */
function InviteStrip({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  function copy(what: "code" | "link") {
    const text =
      what === "code"
        ? code
        : `${window.location.origin}/matches/join?code=${encodeURIComponent(code)}`;
    void navigator.clipboard?.writeText(text).then(() => setCopied(what));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold">
        Invitation code
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 rounded-xl border-2 border-dashed border-[#1c2b45] bg-secondary px-3 py-2 text-center font-mono text-base font-extrabold tracking-[3px] text-[#1c2b45]">
          {code}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => copy("code")}
        >
          {copied === "code" ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => copy("link")}
        >
          {copied === "link" ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Link2 className="size-4" aria-hidden="true" />
          )}
          {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Discard a match that never started (`POST /api/matches/:id/cancel`, M6-T6).
 *
 * Cancellation is not reversible, so — like every other client action
 * (`frontend.md` §6, `game-specification.md` §10.4) — the button confirms
 * explicitly before it fires, with no undo afterwards. The server is the
 * authority on whether the status still allows it; a refused cancel surfaces
 * inline instead of optimistically removing the row.
 */
function DiscardAction({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discard() {
    setPending(true);
    setError(null);
    try {
      await apiClient.cancelMatch(matchId);
      setConfirming(false);
      router.refresh();
    } catch {
      setError("That match can no longer be discarded.");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error !== null && (
          <p role="alert" className="flex-1 text-xs font-bold text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Discard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="flex-1 text-xs font-bold">
        Discard this match? This cannot be undone.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Keep it
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => void discard()}
      >
        {pending ? "Discarding…" : "Discard match"}
      </Button>
    </div>
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
          // 48px over a 15×10 board is ~3px per tile: smooth, not pixelated.
          <MapThumbnail map={preview} pixelated={false} />
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

  const summary =
    href === null ? (
      <div className="flex items-center gap-4">{body}</div>
    ) : (
      <Link
        href={href}
        className="flex items-center gap-4 rounded-xl transition-[filter,transform] hover:brightness-[1.02] motion-safe:active:translate-y-0.5"
      >
        {body}
      </Link>
    );

  // Pre-active rows carry a footer: the host's invite, and the discard action.
  // It lives outside the summary `Link`, so no button is ever nested in a link.
  const showInvite = match.invitationCode !== null;
  const showDiscard = CANCELLABLE_STATUSES.includes(match.status);
  if (showInvite || showDiscard) {
    return (
      <div className={cn(shell, "flex-col items-stretch gap-3")}>
        {summary}
        <div className="flex flex-col gap-2 border-t-2 border-dashed border-border pt-3">
          {match.invitationCode !== null && (
            <InviteStrip code={match.invitationCode} />
          )}
          {showDiscard && <DiscardAction matchId={match.matchId} />}
        </div>
      </div>
    );
  }

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
  matches: initialMatches,
  nowMs,
  mapPreviews = {},
  live = true,
}: {
  matches: readonly MatchSummary[];
  /** A fixed clock for tests; omitted in production so the client ticks live. */
  nowMs?: number;
  /** The official maps, keyed by id, from the server's game data. */
  mapPreviews?: MapPreviews;
  /** Off in tests that assert a fixed list; on in the app (M11-T1). */
  live?: boolean;
}) {
  const [matches, setMatches] = useState(initialMatches);
  // The server stays the senior writer. `router.refresh()` (after discarding a
  // match) re-renders the RSC while deliberately preserving client state, so a
  // list held purely in state would ignore the very update that refresh exists
  // to deliver. Adopting the new prop on sight keeps the row disappearing
  // immediately, exactly as it did before this list went live.
  const [renderedProp, setRenderedProp] = useState(initialMatches);
  if (initialMatches !== renderedProp) {
    setRenderedProp(initialMatches);
    setMatches(initialMatches);
  }

  const [now, setNow] = useState<number | null>(nowMs ?? null);
  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  });

  // Rows go stale when the opponent moves — a turn passes to you, a match ends.
  // But this is a list you glance at on the way somewhere, not a screen you wait
  // in front of: the turn you are waiting for arrives by email and on the board
  // itself. So it refreshes **when it is looked at** rather than on a clock,
  // which keeps it correct every time it is read and costs nothing in between.
  useLiveSync({
    enabled: live,
    attentionOnly: true,
    poll: async () => {
      const fresh = await apiClient.listMatches();
      if (sameRows(matchesRef.current, fresh)) return false;
      setMatches(fresh);
      return true;
    },
  });
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
          No matches yet. Start one, or join with an invitation code.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/matches/join">
              <LogIn className="size-4" aria-hidden="true" />
              Join match
            </Link>
          </Button>
          <Button asChild>
            <Link href="/matches/new">
              <Plus className="size-4" aria-hidden="true" />
              New match
            </Link>
          </Button>
        </div>
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
