"use client";

import { useEffect, useRef } from "react";

/**
 * Adaptive live-sync loop (M11-T1).
 *
 * The screens that must react to the *opponent's* moves poll through this hook.
 * WebSockets are not an option on the deployment target — Vercel Functions do
 * not support the socket upgrade — and SSE degrades to polling inside the stream
 * anyway (the Neon HTTP driver has no `LISTEN/NOTIFY`). Adaptive polling gives
 * the same perceived latency with no extra infrastructure.
 *
 * The hook owns only *when* to ask; the caller owns *what* to ask and what to do
 * with the answer. `poll` reports whether anything changed, which drives the
 * cadence:
 *
 * - **Hidden tab: no requests at all.** A tab in the background is not being
 *   watched, and invocations are a real budget. Becoming visible polls
 *   immediately — that is exactly the "I came back to the tab" moment.
 * - **Nobody there: no requests either.** After `idleStopMs` without a sign of
 *   the human — pointer, key, focus, visibility — the loop goes dormant and the
 *   first sign of them wakes it with an immediate poll. What matters is not that
 *   the *server* is quiet but that **nobody is watching**: a serverless database
 *   suspends when idle, and a forgotten tab querying it every 30s all night
 *   keeps it awake for an audience of no one.
 * - **Backoff.** Starts at `activeMs` and eases toward `idleMs` while nothing
 *   changes; any change (or regaining attention) snaps back to `activeMs`.
 * - **No overlap.** A tick that finds the previous one still in flight skips,
 *   so a slow network cannot pile up requests.
 * - **Silent on failure.** A failed poll is not a game error: it backs off and
 *   retries rather than surfacing an alert over the board.
 *
 * Raising `idleMs` is deliberately *not* the lever for cost: any interval under
 * the database's suspend window pins it awake, and any interval over it pays a
 * cold start on every tick. Poll while someone is looking; stop when they leave.
 *
 * @see docs/03-architecture/frontend.md
 */
export interface LiveSyncOptions {
  /** One sync attempt. Resolves `true` when something changed. */
  readonly poll: () => Promise<boolean>;
  /**
   * A momentary "not now" — the caller is mid-interaction and must not be
   * disturbed. Deliberately **not** the same as a quiet poll: a skipped tick
   * leaves the cadence untouched, so a player who deliberates for a minute does
   * not come back to a loop that has drifted out to `idleMs`. Read fresh on
   * every tick, so it never re-arms the timer.
   */
  readonly canPoll?: () => boolean;
  /** Set false to stop polling entirely (e.g. the match already ended). */
  readonly enabled?: boolean;
  /** Cadence while things are happening. */
  readonly activeMs?: number;
  /** The slowest cadence a quiet screen settles at. */
  readonly idleMs?: number;
  /**
   * Go dormant after this long without a sign of the human. Any pointer, key,
   * focus or visibility event wakes it with an immediate poll.
   */
  readonly idleStopMs?: number;
  /**
   * No interval at all — poll *only* when attention returns (the tab becomes
   * visible, or the window regains focus). For a screen that is browsed rather
   * than waited on, like a match list: it is fresh every time it is looked at
   * and costs nothing in between.
   */
  readonly attentionOnly?: boolean;
}

/** How fast a quiet screen eases from `activeMs` toward `idleMs`. */
const BACKOFF_FACTOR = 1.5;

/**
 * Signals that someone is still there. `pointermove` is included and is cheap:
 * the handler only stamps a timestamp, and only schedules work when waking from
 * dormancy.
 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
] as const;

export function useLiveSync({
  poll,
  canPoll,
  enabled = true,
  activeMs = 3_000,
  idleMs = 20_000,
  idleStopMs = 10 * 60_000,
  attentionOnly = false,
}: LiveSyncOptions): void {
  // The latest callbacks without restarting the loop: they close over render
  // state, so a dependency on them would tear down the timer every render.
  // Written after commit (never during render) so a re-render that React throws
  // away cannot leave a stale callback behind.
  const pollRef = useRef(poll);
  const canPollRef = useRef(canPoll);
  useEffect(() => {
    pollRef.current = poll;
    canPollRef.current = canPoll;
  });

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let cancelled = false;
    let inFlight = false;
    let delay = activeMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** No timer pending: either nobody is here, or only attention polls. */
    let dormant = attentionOnly;
    let lastSeenAt = Date.now();

    const isVisible = (): boolean => document.visibilityState !== "hidden";

    function schedule(ms: number): void {
      clearTimeout(timer);
      dormant = false;
      timer = setTimeout(() => void tick(), ms);
    }

    /** Stop scheduling. Only an attention or activity signal restarts it. */
    function sleep(): void {
      clearTimeout(timer);
      dormant = true;
    }

    async function tick(): Promise<void> {
      if (cancelled) return;
      // A hidden tab keeps the loop alive but never reaches the network.
      if (!isVisible() || inFlight) {
        schedule(delay);
        return;
      }
      // Nobody has touched anything in a long time. Stop asking rather than hold
      // a serverless database awake for an empty chair.
      if (Date.now() - lastSeenAt > idleStopMs) {
        sleep();
        return;
      }

      // A caller mid-interaction is not a quiet server: hold the cadence where
      // it is so the loop is still responsive the moment they are done.
      if (canPollRef.current?.() === false) {
        schedule(Math.min(delay, activeMs));
        return;
      }

      inFlight = true;
      let changed = false;
      try {
        changed = await pollRef.current();
      } catch {
        // A dropped request is not the player's problem — retry on the next tick.
      } finally {
        inFlight = false;
      }
      if (cancelled) return;

      delay = changed
        ? activeMs
        : Math.min(idleMs, Math.round(delay * BACKOFF_FACTOR));
      if (attentionOnly) sleep();
      else schedule(delay);
    }

    /**
     * Attention returned — the tab was looked at again. Always worth an
     * immediate poll, and it is the only thing that polls at all in
     * `attentionOnly` mode.
     */
    function onAttention(): void {
      lastSeenAt = Date.now();
      if (!isVisible()) return;
      delay = activeMs;
      schedule(0);
    }

    /**
     * The human is still here. This only *records* that — waking the loop when
     * it had gone dormant — so a moving pointer never forces extra requests.
     */
    function onActivity(): void {
      lastSeenAt = Date.now();
      if (dormant && !attentionOnly && isVisible()) {
        delay = activeMs;
        schedule(0);
      }
    }

    document.addEventListener("visibilitychange", onAttention);
    window.addEventListener("focus", onAttention);
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    if (!attentionOnly) schedule(delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onAttention);
      window.removeEventListener("focus", onAttention);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity);
      }
    };
  }, [enabled, activeMs, idleMs, idleStopMs, attentionOnly]);
}
