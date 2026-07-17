"use client";

import { Grid3x3, LogOut } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/**
 * Signed-in shell chrome (M9-T2).
 *
 * Presentational top nav: the brand links home, the signed-in identity is
 * shown, and sign-out posts the injected server action. DOM-only so it renders
 * under RTL with a mocked action.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */
export function AppNav({
  userLabel,
  signOutAction,
}: {
  userLabel: string;
  signOutAction: () => void | Promise<void>;
}) {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 font-semibold"
        >
          <Grid3x3 className="size-5 text-primary" aria-hidden="true" />
          Iron Grid
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userLabel}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </nav>
    </header>
  );
}
