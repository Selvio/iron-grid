"use client";

import { useState } from "react";

import type { NotificationPreferences } from "@/app/lib/api-client";
import { ApiError, apiClient } from "@/app/lib/api-client";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { Card, CardContent } from "@/app/components/ui/card";

/**
 * Notification-preference toggles (M9-T7).
 *
 * The five gameplay triggers over `GET/PATCH /api/me/notifications`. Each toggle
 * is optimistic then reconciled against the server's returned preferences; a
 * failed PATCH reverts and surfaces the error. The server stays authoritative.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

const FIELDS: readonly {
  key: keyof NotificationPreferences;
  label: string;
  hint: string;
}[] = [
  {
    key: "match_invitation",
    label: "Match invitations",
    hint: "When someone invites you to a match.",
  },
  {
    key: "turn_started",
    label: "Your turn started",
    hint: "When it becomes your turn.",
  },
  {
    key: "turn_reminder",
    label: "Turn deadline reminder",
    hint: "Before your turn deadline passes.",
  },
  {
    key: "turn_expired",
    label: "Turn deadline passed",
    hint: "When your turn deadline has passed.",
  },
  {
    key: "match_completed",
    label: "Match completed",
    hint: "When one of your matches ends.",
  },
];

export function NotificationPreferencesForm({
  initial,
}: {
  initial: NotificationPreferences;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [pending, setPending] = useState<keyof NotificationPreferences | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof NotificationPreferences, next: boolean) {
    const previous = preferences;
    setPreferences({ ...preferences, [key]: next }); // optimistic
    setPending(key);
    setError(null);
    try {
      const updated = await apiClient.updateNotificationPreferences({
        [key]: next,
      });
      setPreferences(updated); // reconcile with the server
    } catch (err) {
      setPreferences(previous); // revert
      setError(
        err instanceof ApiError
          ? "Could not save that change. Try again."
          : "Something went wrong. Try again.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Email notifications
        </h1>
        <p className="mt-1 text-muted-foreground">
          Choose which emails Iron Grid sends you.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Card>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {FIELDS.map((field) => (
            <div
              key={field.key}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex flex-col">
                <Label htmlFor={field.key}>{field.label}</Label>
                <span className="text-sm text-muted-foreground">
                  {field.hint}
                </span>
              </div>
              <Switch
                id={field.key}
                checked={preferences[field.key]}
                disabled={pending === field.key}
                onCheckedChange={(next) => void toggle(field.key, next)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
