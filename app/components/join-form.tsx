"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ApiError, apiClient } from "@/app/lib/api-client";
import { joinMatchSchema, type JoinMatchInput } from "@/app/lib/schemas";
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
 * Join-by-code form (M9-T6).
 *
 * react-hook-form + Zod; the invitation link pre-fills the code. On success the
 * match advances to `commander_selection` and the guest is routed to commander
 * selection. A wrong code / already-full match surfaces the server's typed error.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export function JoinForm({
  matchId,
  defaultCode = "",
}: {
  matchId: string;
  defaultCode?: string;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinMatchInput>({
    resolver: zodResolver(joinMatchSchema),
    defaultValues: { code: defaultCode },
  });

  const onSubmit = handleSubmit(async ({ code }) => {
    setSubmitError(null);
    try {
      await apiClient.joinMatch(matchId, code);
      router.push(`/matches/${matchId}/commander`);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? "That invitation is not valid, or the match is full."
          : "Something went wrong. Try again.",
      );
    }
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join match</CardTitle>
        <CardDescription>
          Enter the invitation code your opponent shared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Invitation code</Label>
            <Input
              id="code"
              autoComplete="off"
              className="font-mono uppercase tracking-widest"
              {...register("code")}
            />
            {errors.code && (
              <p role="alert" className="text-sm text-destructive">
                {errors.code.message}
              </p>
            )}
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Joining…" : "Join match"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
