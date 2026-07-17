import { Grid3x3 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/**
 * Signed-out landing (M9-T1).
 *
 * The branded entry point. Session-aware routing (redirect a signed-in visitor
 * to the dashboard, drive magic-link sign-in) lands in M9-T2; this ticket
 * establishes the brand and the shell chrome.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Grid3x3 className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
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
    </main>
  );
}
