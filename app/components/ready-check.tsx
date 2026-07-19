"use client";

import Link from "next/link";
import { useState } from "react";

import { ApiError, apiClient } from "@/app/lib/api-client";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * Ready check (M9-T6).
 *
 * The player confirms readiness (`POST …/ready`). The server reflects the
 * transition: `ready_check` while it waits on the opponent, `active` once both
 * have confirmed — at which point the match has started and the battlefield
 * (M10) is the next stop.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export function ReadyCheck({ matchId }: { matchId: string }) {
  const [state, setState] = useState<"idle" | "waiting" | "active">("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function ready() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.readyUp(matchId);
      setState(result.status === "active" ? "active" : "waiting");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? "Could not confirm. Try again."
          : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "active") {
    return (
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>The match has begun</CardTitle>
          <CardDescription>Both players are ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={`/matches/${matchId}/play`}>Enter the battlefield</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm text-center">
      <CardHeader>
        <CardTitle>Ready check</CardTitle>
        <CardDescription>
          {state === "waiting"
            ? "You're ready. Waiting for your opponent."
            : "Confirm you're ready to start the match."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          onClick={() => void ready()}
          disabled={submitting || state === "waiting"}
        >
          {state === "waiting"
            ? "Ready ✓"
            : submitting
              ? "Confirming…"
              : "I'm ready"}
        </Button>
      </CardContent>
    </Card>
  );
}
