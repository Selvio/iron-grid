"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { MAGIC_LINK_PROVIDER_ID, signIn, signOut } from "@/app/server/auth";

/**
 * Server actions driving the Auth.js magic-link flow from the shell (M9-T2).
 *
 * `signInAction` sends the sign-in email, then redirects to the branded
 * "check your inbox" state (`/sign-in?sent=1`). We own that redirect instead of
 * following Auth.js's `/api/auth/verify-request` hop: that hop appends
 * `?provider=&type=` onto `pages.verifyRequest`, which breaks a `?sent=1` URL
 * into a malformed query and drops the user back on an empty form.
 * `signOutAction` clears the database session. Both are server-only; the client
 * forms call them, never the auth internals directly.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (email === "") {
    redirect("/sign-in?error=1");
  }
  try {
    await signIn(MAGIC_LINK_PROVIDER_ID, {
      email,
      redirectTo: "/dashboard",
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in?error=1");
    }
    throw error;
  }
  redirect("/sign-in?sent=1");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
