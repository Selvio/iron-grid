import { Plus } from "lucide-react";
import Link from "next/link";

import {
  DashboardList,
  type MapPreviews,
} from "@/app/components/dashboard-list";
import { Button } from "@/app/components/ui/button";
import { requireSessionUser } from "@/app/lib/session";
import { createDatabase, type Database } from "@/app/server/db";
import { listMatchesForUser } from "@/app/server/db/queries/matches";
import { getGameData } from "@/app/server/load-game-data";

/**
 * Dashboard — the signed-in landing (M9-T4).
 *
 * A server component: it gates on the session and reads the caller's matches
 * server-side (the membership-scoped `listMatchesForUser`), then hands the rows
 * to the client `DashboardList` for grouping and countdown rendering. The
 * matching HTTP route (`GET /api/matches`) serves the same data to client-side
 * refetches.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4)
 */

// The pooled client is reused across requests within a warm runtime.
let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

/**
 * The design's header subtitle — a plain count of what is going on (§5).
 */
function summarize(matches: readonly { status: string }[]): string {
  const active = matches.filter((m) => m.status === "active").length;
  const starting = matches.filter((m) =>
    [
      "draft",
      "waiting_for_opponent",
      "commander_selection",
      "ready_check",
    ].includes(m.status),
  ).length;
  const plural = (n: number, noun: string) => `${n} ${noun}`;
  return [
    plural(active, "active"),
    `${starting} waiting to start`,
    "asynchronous 1v1",
  ].join(" · ");
}

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const matches = await listMatchesForUser(database(), user.id);

  // The official map catalogue supplies each row's thumbnail and `W×H` readout.
  const mapPreviews: MapPreviews = Object.fromEntries(
    Object.values(getGameData().maps).map((map) => [
      map.id,
      {
        id: map.id,
        width: map.dimensions.width,
        height: map.dimensions.height,
        terrain: map.logical_terrain,
      },
    ]),
  );

  return (
    <section className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Your matches
          </h1>
          {matches.length > 0 && (
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
              {summarize(matches)}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/matches/new">
            <Plus className="size-4" aria-hidden="true" />
            New match
          </Link>
        </Button>
      </div>
      <DashboardList matches={matches} mapPreviews={mapPreviews} />
    </section>
  );
}
