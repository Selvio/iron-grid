import { Grid3x3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/app/components/ui/button";
import { getSessionUser } from "@/app/lib/session";

/**
 * Signed-out landing (M9-T1).
 *
 * The branded entry point; a signed-in visitor is routed straight to the
 * dashboard. Magic-link sign-in is driven from `/sign-in` (M9-T2).
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1, M9-T2)
 */
export default async function Home() {
  if (await getSessionUser()) {
    redirect("/dashboard");
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl border-[3px] border-[#1c2b45] bg-primary text-[#052a25] shadow-[0_5px_0_rgba(28,43,69,0.22)]">
        <Grid3x3 className="size-8" aria-hidden="true" />
      </span>
      <h1 className="font-display text-5xl font-extrabold tracking-tight text-[#1c2b45] sm:text-6xl">
        Iron Grid
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted-foreground">
        Turn-based strategy, played at your own pace. Take the grid.
      </p>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link href="/sign-in">Sign in to play</Link>
        </Button>
      </div>
      <Link
        href="/credits"
        className="mt-12 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Credits
      </Link>
    </main>
  );
}
