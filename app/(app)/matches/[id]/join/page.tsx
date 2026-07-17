import { JoinForm } from "@/app/components/join-form";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Join screen (M9-T6). Gated; the code pre-fills from the invitation link.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  await requireSessionUser();
  const { id } = await params;
  const { code } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <JoinForm matchId={id} defaultCode={code ?? ""} />
    </main>
  );
}
