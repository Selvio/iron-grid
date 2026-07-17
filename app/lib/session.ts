import { redirect } from "next/navigation";

import { auth } from "@/app/server/auth";

/**
 * Session gating for the App-Router shell (M9-T2).
 *
 * Server-only: these wrap the landed `auth()` resolver (M5) so RSCs read the
 * signed-in identity without touching the auth internals. `requireSessionUser`
 * is the gate — an unauthenticated visitor to a protected route is redirected to
 * the branded sign-in screen (`frontend.md` §2). Import only from server
 * components / server actions; never from a client component.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */

/** The signed-in session user, or `null` when unauthenticated. */
export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** The signed-in user, or a redirect to `/sign-in` when there is none. */
export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
