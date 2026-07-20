"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
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
 * react-hook-form + Zod; the invitation link may pre-fill the code. When
 * `matchId` is omitted the client posts to the code-only join route so a guest
 * only needs the six-character invitation. On success the match advances to
 * `commander_selection` and the guest is routed there. A wrong code / already-
 * full match surfaces the server's typed error.
 *
 * Styled after the "Join a match" card of the invite/join screen in the Claude
 * Design mockup (`design-reference.md` §5): blue icon tile, gold `ENTER CODE`
 * label, and a large centered monospace code field on cream.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */
export function JoinForm({
  matchId,
  defaultCode = "",
}: {
  /** When set, the deep-link join path is used; otherwise code-only. */
  matchId?: string;
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
      const result = await apiClient.joinMatch(code, matchId);
      router.push(`/matches/${result.matchId}/commander`);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? "That invitation is not valid, or the match is full."
          : "Something went wrong. Try again.",
      );
    }
  });

  return (
    <Card className="w-full max-w-sm border-[3px] shadow-[0_5px_0_rgba(28,43,69,0.26)]">
      <CardHeader className="space-y-0 pb-4">
        <span
          aria-hidden="true"
          className="mb-4 flex size-11 items-center justify-center rounded-xl border-[3px] border-[#1c2b45] bg-linear-to-br from-[#4a93f7] to-[#2f74dd] text-white"
        >
          <LogIn className="size-5" strokeWidth={2.4} />
        </span>
        <CardTitle className="text-[19px] font-extrabold">
          Join a match
        </CardTitle>
        <CardDescription className="pt-1.5 text-xs font-semibold text-[#7a6a3a]">
          Enter the code your opponent sent you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="code"
              className="text-[11px] font-extrabold uppercase tracking-wide text-[#a08a4a]"
            >
              Enter code
            </Label>
            <Input
              id="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-auto rounded-xl border-[3px] border-[#1c2b45] bg-[#fbeecb] px-3 py-3 text-center font-mono text-xl font-extrabold uppercase tracking-[3px] text-[#1c2b45]"
              {...register("code")}
            />
            {errors.code && (
              <p role="alert" className="text-xs font-bold text-destructive">
                {errors.code.message}
              </p>
            )}
          </div>
          {submitError && (
            <p role="alert" className="text-xs font-bold text-destructive">
              {submitError}
            </p>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Joining…" : "Join match"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
