import { Battlefield } from "@/app/components/battlefield/battlefield";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Battlefield screen (M10-T1).
 *
 * Gated server component hosting the Phaser canvas. T1 mounts the canvas and the
 * asset pipeline; T2+ fetch the fog-projected `MatchView` and render the board,
 * units and HUD around it.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T1)
 */
export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSessionUser();
  await params; // matchId is consumed by the projection fetch in M10-T2.

  return (
    <div className="fixed inset-0 top-14 bg-background">
      <Battlefield />
    </div>
  );
}
