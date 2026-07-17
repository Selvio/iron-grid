import { Flag, Trophy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * Completed-match summary (M9-T7).
 *
 * Presentational: it renders the winner and completion reason the server reports
 * (`game-specification.md` §23), read from `GET /api/matches/:id` — M9 submits no
 * actions, so the outcome is fetched, never derived client-side.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

export type CompletionReason =
  | "headquarters_captured"
  | "army_eliminated"
  | "resignation"
  | "timeout_claimed"
  | "day_limit_score"
  | "administrative";

const REASON_TEXT: Record<CompletionReason, string> = {
  headquarters_captured: "Headquarters captured",
  army_eliminated: "Army eliminated",
  resignation: "Resignation",
  timeout_claimed: "Turn deadline expired",
  day_limit_score: "Day limit reached",
  administrative: "Ended by an administrator",
};

export function MatchCompleted({
  viewerPlayerId,
  winnerPlayerId,
  completionReason,
}: {
  viewerPlayerId: string;
  winnerPlayerId: string | null;
  completionReason: CompletionReason | null;
}) {
  const won = winnerPlayerId !== null && winnerPlayerId === viewerPlayerId;
  return (
    <Card className="w-full max-w-sm text-center">
      <CardHeader>
        <span
          className={`mx-auto mb-2 inline-flex size-12 items-center justify-center rounded-full ${
            won
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {won ? (
            <Trophy className="size-6" aria-hidden="true" />
          ) : (
            <Flag className="size-6" aria-hidden="true" />
          )}
        </span>
        <CardTitle>
          {winnerPlayerId === null ? "Match ended" : won ? "Victory" : "Defeat"}
        </CardTitle>
        <CardDescription>
          {completionReason
            ? REASON_TEXT[completionReason]
            : "The match is over."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
