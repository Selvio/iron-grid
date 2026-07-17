import { AppNav } from "@/app/components/app-nav";
import { signOutAction } from "@/app/lib/auth-actions";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Authenticated shell layout (M9-T2).
 *
 * Every route under `(app)` is gated: `requireSessionUser` redirects an
 * unauthenticated visitor to `/sign-in` before any child renders. The signed-in
 * identity and sign-out live in the shared nav chrome.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSessionUser();
  return (
    <div className="flex min-h-full flex-col">
      <AppNav
        userLabel={user.email ?? user.name ?? "Signed in"}
        signOutAction={signOutAction}
      />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </div>
    </div>
  );
}
