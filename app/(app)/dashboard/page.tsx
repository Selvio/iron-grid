import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardList } from "@/app/components/dashboard-list";
import { Button } from "@/app/components/ui/button";
import { requireSessionUser } from "@/app/lib/session";
import { createDatabase, type Database } from "@/app/server/db";
import { listMatchesForUser } from "@/app/server/db/queries/matches";

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

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const matches = await listMatchesForUser(database(), user.id);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your matches</h1>
        <Button asChild>
          <Link href="/matches/new">
            <Plus className="size-4" aria-hidden="true" />
            Create match
          </Link>
        </Button>
      </div>
      <DashboardList matches={matches} />
    </section>
  );
}
