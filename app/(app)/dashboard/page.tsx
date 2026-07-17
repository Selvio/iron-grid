/**
 * Dashboard placeholder (M9-T2).
 *
 * The signed-in landing target for the gated shell. M9-T4 replaces this with the
 * real match list (your-turn / waiting groups, deadline countdowns) backed by
 * `GET /api/matches`.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2, M9-T4)
 */
export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Your matches</h1>
      <p className="mt-2 text-muted-foreground">
        The match list arrives in M9-T4.
      </p>
    </section>
  );
}
