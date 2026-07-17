import { ReadyCheck } from "@/app/components/ready-check";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Ready-check screen (M9-T6). Gated.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export default async function ReadyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSessionUser();
  const { id } = await params;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <ReadyCheck matchId={id} />
    </main>
  );
}
