import { JoinForm } from "@/app/components/join-form";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Join-by-code screen — enter only the six-character invitation.
 *
 * Prefills from `?code=` when the host shared a link. Deep links that already
 * know the match id continue to use `/matches/:id/join`.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export default async function JoinByCodePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireSessionUser();
  const { code } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <JoinForm defaultCode={code ?? ""} />
    </main>
  );
}
