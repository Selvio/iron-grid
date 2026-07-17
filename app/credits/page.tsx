import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/**
 * Credits (M10-T1).
 *
 * Public attribution page — the `game-assets/` pack license requires crediting
 * the artist in the product (`game-assets/license.txt`).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T1)
 */
export const metadata = { title: "Credits — Iron Grid" };

export default function CreditsPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Art
        </h2>
        <p>
          Battlefield tileset and unit sprites by{" "}
          <a
            href="https://www.patreon.com/iknowkingrabbit"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Aleksandr Makarov (@IKnowKingRabbit)
          </a>
          , used under the pack license.
        </p>
      </section>
      <div>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </div>
    </main>
  );
}
