"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { ApiError, apiClient } from "@/app/lib/api-client";
import { createMatchSchema, type CreateMatchInput } from "@/app/lib/schemas";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { MapThumbnail, type MapPreview } from "@/app/components/map-thumbnail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * Create-match form (M9-T5).
 *
 * react-hook-form + Zod (`createMatchSchema`) for `mapId` / `turnDeadline` /
 * `dayLimit`. Fog is not a field — the backend rejects `fogEnabled: true`, so the
 * client always submits fog off (§3). On success it surfaces the invitation code
 * and a shareable join link. Map layouts are design-blocked (`official_maps: {}`,
 * §33) until M10, so with no maps the form makes the block explicit rather than
 * inventing one; tests inject map options to exercise the full flow.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T5)
 */

/**
 * A selectable map: its label, plus the layout the thumbnail draws (M9-T10).
 */
export interface MapOption extends MapPreview {
  readonly label: string;
}

const DEADLINE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "none", label: "No deadline" },
];

export function CreateMatchForm({ maps }: { maps: readonly MapOption[] }) {
  const hasMaps = maps.length > 0;
  const [created, setCreated] = useState<{
    matchId: string;
    invitationCode: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateMatchInput>({
    resolver: zodResolver(createMatchSchema),
    defaultValues: {
      mapId: maps[0]?.id ?? "",
      turnDeadline: "24h",
      dayLimit: null,
    },
  });

  // The preview follows the select, so you see the layout you are picking.
  // `useWatch` (not `watch`) so the subscription is a hook, not a render-time call.
  const selectedId = useWatch({ control, name: "mapId" });
  const selectedMap = maps.find((map) => map.id === selectedId) ?? maps[0];

  if (created) {
    const joinPath = `/matches/${created.matchId}/join?code=${created.invitationCode}`;
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Match created</CardTitle>
          <CardDescription>
            Share the invitation code with your opponent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted px-4 py-3">
            <span className="font-mono text-lg tracking-widest">
              {created.invitationCode}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(created.invitationCode)
                  .then(() => setCopied(true));
              }}
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline" className="flex-1">
              <Link href={joinPath}>Open invite</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const result = await apiClient.createMatch(values);
      setCreated({
        matchId: result.matchId,
        invitationCode: result.invitationCode,
      });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? `Could not create the match (${error.code}).`
          : "Something went wrong. Try again.",
      );
    }
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>New match</CardTitle>
        <CardDescription>
          Set up a match and invite an opponent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mapId">Map</Label>
            {selectedMap !== undefined && (
              <MapThumbnail
                map={selectedMap}
                className="w-full rounded-lg border-2 border-[#1c2b45]"
              />
            )}
            {hasMaps ? (
              <select
                id="mapId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...register("mapId")}
              >
                {maps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                No maps are available yet — official map design is pending.
              </p>
            )}
            {errors.mapId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.mapId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="turnDeadline">Turn deadline</Label>
            <select
              id="turnDeadline"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register("turnDeadline")}
            >
              {DEADLINE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dayLimit">Day limit (optional)</Label>
            <Input
              id="dayLimit"
              type="number"
              min={1}
              placeholder="No limit"
              {...register("dayLimit", {
                setValueAs: (value) =>
                  value === "" || value === null ? null : Number(value),
              })}
            />
            {errors.dayLimit && (
              <p role="alert" className="text-sm text-destructive">
                {errors.dayLimit.message}
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Fog of war is coming soon and is off for now.
          </p>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button type="submit" disabled={!hasMaps || isSubmitting}>
            {isSubmitting ? "Creating…" : "Create match"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
