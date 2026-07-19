import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/**
 * Credits (M10-T1).
 *
 * Public attribution page. The battlefield currently runs on placeholder art
 * that is not ours to ship, so this page states that plainly rather than
 * implying a license we do not have (`game-assets/license.txt`, ADR-0005).
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
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
          The battlefield sprites are placeholders ripped from the Game Boy
          Advance <em>Advance Wars</em> games and remain the property of
          Nintendo and Intelligent Systems. They stand in during development and
          will be replaced with original art before release.
        </p>
        <p className="text-sm text-muted-foreground">
          Rips credited by the source sheets: Dr. Phileas Fragg, Grim and
          Rogultgot. Earlier builds used the Pangea Wars pack by{" "}
          <a
            href="https://www.patreon.com/iknowkingrabbit"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Aleksandr Makarov (@IKnowKingRabbit)
          </a>
          .
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
