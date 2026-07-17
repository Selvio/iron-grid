"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { MAGIC_LINK_PROVIDER_ID, signIn, signOut } from "@/app/server/auth";

/**
 * Server actions driving the Auth.js magic-link flow from the shell (M9-T2).
 *
 * `signInAction` sends the sign-in email and hands off to the "check your inbox"
 * state (Auth.js redirects to the configured `verifyRequest` page,
 * `/sign-in?sent=1`). `signOutAction` clears the database session. Both are
 * server-only; the client forms call them, never the auth internals directly.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (email === "") {
    redirect("/sign-in?error=1");
  }
  try {
    await signIn(MAGIC_LINK_PROVIDER_ID, { email, redirectTo: "/dashboard" });
  } catch (error) {
    // Auth.js signals the post-send hand-off and redirects via thrown control
    // flow; only a genuine AuthError is surfaced as an error state.
    if (error instanceof AuthError) {
      redirect("/sign-in?error=1");
    }
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
