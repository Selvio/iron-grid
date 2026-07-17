import { redirect } from "next/navigation";

import { SignInForm } from "@/app/components/sign-in-form";
import { signInAction } from "@/app/lib/auth-actions";
import { getSessionUser } from "@/app/lib/session";

/**
 * Sign-in screen (M9-T2).
 *
 * An already-signed-in visitor is bounced to the dashboard. Otherwise it renders
 * the magic-link form, or the "check your inbox" state once Auth.js has sent the
 * link (`?sent=1`, the configured `verifyRequest` target).
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  if (await getSessionUser()) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <SignInForm
        action={signInAction}
        sent={params.sent === "1"}
        error={params.error === "1"}
      />
    </main>
  );
}
