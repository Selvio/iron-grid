"use client";

import { MailCheck } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * Sign-in surface (M9-T2).
 *
 * Presentational and DOM-only so it renders under RTL: it receives the sign-in
 * server action and the `sent` / `error` flags from its server-component parent.
 * Magic-link only — an email in, then the "check your inbox" state; no password.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T2)
 */
export function SignInForm({
  action,
  sent = false,
  error = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  sent?: boolean;
  error?: boolean;
}) {
  if (sent) {
    return (
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <span className="mx-auto mb-2 inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent you a sign-in link. Open it on this device to continue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Iron Grid</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a sign-in link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              We could not send that link. Check the address and try again.
            </p>
          )}
          <Button type="submit" className="w-full">
            Send sign-in link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
