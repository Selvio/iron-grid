"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FactionId } from "@/app/components/faction-badge";
import { FactionBadge } from "@/app/components/faction-badge";
import { ApiError, apiClient } from "@/app/lib/api-client";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";

/**
 * Commander selection (M9-T6).
 *
 * Four factions/commanders with **placeholder** identity — commander and faction
 * names are design-blocked (§33.1), so each option is its FactionBadge (color +
 * insignia) and the neutral label "Commander", never an invented name. The
 * server owns uniqueness (`duplicate_faction_selection_allowed: false`): a taken
 * faction comes back as a typed error, surfaced for a retry. When the server
 * reports `ready_check` (both chosen) the player is routed to the ready check.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

export interface CommanderOption {
  readonly id: string;
  readonly faction: FactionId;
}

export function CommanderSelect({
  matchId,
  commanders,
}: {
  matchId: string;
  commanders: readonly CommanderOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<FactionId | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function choose(option: CommanderOption) {
    setPending(option.id);
    setError(null);
    try {
      const result = await apiClient.selectCommander(matchId, option.id);
      setSelectedFaction(option.faction);
      if (result.status === "ready_check") {
        router.push(`/matches/${matchId}/ready`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "commander_unavailable"
          ? "That faction is taken. Choose another."
          : "Something went wrong. Try again.",
      );
    } finally {
      setPending(null);
    }
  }

  if (selectedFaction) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">You chose</p>
        <FactionBadge faction={selectedFaction} className="text-lg" />
        <p className="text-sm text-muted-foreground">
          Waiting for your opponent to choose. Refresh to check for the ready
          check.
        </p>
        <Button variant="outline" asChild>
          <a href={`/matches/${matchId}/ready`}>Go to ready check</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
        Choose your commander
      </h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        {commanders.map((option) => (
          <Card key={option.id}>
            <CardContent className="flex flex-col items-center gap-4 p-6">
              <FactionBadge faction={option.faction} className="text-lg" />
              <span className="text-sm text-muted-foreground">Commander</span>
              <Button
                className="w-full"
                disabled={pending !== null}
                onClick={() => void choose(option)}
              >
                {pending === option.id ? "Choosing…" : "Select"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
