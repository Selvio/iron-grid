import type { ActionResult } from "@/app/server/actions/commit";
import type { NotificationPreferences } from "@/app/server/db/schema/users";
import type { MatchView } from "@/app/server/actions/read";

import type { CreateMatchInput } from "./schemas";

/**
 * Typed client for the server surface the UI consumes (M9-T3).
 *
 * The single seam the frontend calls the backend through (`frontend.md` §2, §9).
 * Same-origin `fetch` carries the Auth.js **session cookie** automatically —
 * there is no bearer token. Every failure decodes to a typed `ApiError`
 * (`{ error: code }`, plus `currentStateVersion` on a `409` conflict and `codes`
 * on a validation failure) so callers branch on `code`, not HTTP status strings.
 * Response *types* are imported type-only from the server/engine boundary; no
 * runtime server module is pulled into the client bundle.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T3)
 */

export type { ActionResult, MatchView, NotificationPreferences };

/** A gameplay action submit body: the engine action + concurrency envelope. */
export type ActionBody = JsonBody & {
  readonly type: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
};

/** One projected player event from the event stream. */
export interface PlayerEvent {
  readonly sequence: number;
  readonly type: string;
  readonly payload: unknown;
}

/** A match's lifecycle status, as the read model reports it. */
export type MatchStatus = MatchView["status"];

/** A row of the dashboard list (`GET /api/matches`, added in M9-T4). */
/** The other seat, as the dashboard is allowed to see it (M9-T9). */
export interface MatchOpponent {
  /** Their display name, or `null` when they never set one. */
  readonly name: string | null;
  /** Magic-link identity — shown when they have no display name. */
  readonly email: string;
  /** A faction id, or `null` before they pick a commander. */
  readonly factionId: string | null;
}

export interface MatchSummary {
  readonly matchId: string;
  readonly status: MatchStatus;
  readonly role: "host" | "guest";
  /** The caller's player id in this match — lets the client mark "your turn". */
  readonly viewerPlayerId: string;
  readonly activePlayerId: string | null;
  readonly turnDeadlineAt: string | null;
  /** The map played on — the dashboard row's identity (M9-T9). */
  readonly mapId: string;
  /** The day counter; `0` until the match activates. */
  readonly day: number;
  /** `null` while the second seat is still unfilled. */
  readonly opponent: MatchOpponent | null;
  /**
   * The code to share, set only for the host of a `waiting_for_opponent` match
   * — the dashboard shows it so a host can recover the invite later.
   */
  readonly invitationCode: string | null;
}

export interface CreateMatchResult {
  readonly matchId: string;
  readonly invitationCode: string;
  readonly status: "waiting_for_opponent";
}

export interface JoinMatchResult {
  readonly matchId: string;
  readonly status: "commander_selection";
}

export interface CommanderSelectResult {
  readonly matchId: string;
  readonly status: "commander_selection" | "ready_check";
  readonly commanderId: string;
  readonly factionId: string;
}

export interface ReadyResult {
  readonly matchId: string;
  readonly status: "ready_check" | "active";
}

export interface CancelResult {
  readonly matchId: string;
  readonly status: "cancelled";
}

/** A pre-active match has no engine state yet (`GET /api/matches/:id`). */
export interface PreActiveMatchView {
  readonly matchId: string;
  readonly status: MatchStatus | null;
  readonly board: null;
}

/** A typed transport/domain error decoded from a non-2xx response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly currentStateVersion?: number,
    readonly codes?: readonly string[],
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type JsonBody = Record<string, unknown>;

async function request<T>(
  path: string,
  init?: { method?: string; body?: JsonBody },
): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = (await response.json().catch(() => null)) as
    | (JsonBody & {
        error?: string;
        currentStateVersion?: number;
        codes?: string[];
      })
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "request_failed",
      data?.currentStateVersion,
      data?.codes,
    );
  }
  return data as T;
}

export const apiClient = {
  listMatches: () => request<MatchSummary[]>("/api/matches"),

  getMatch: (matchId: string) =>
    request<MatchView | PreActiveMatchView>(
      `/api/matches/${encodeURIComponent(matchId)}`,
    ),

  createMatch: (input: CreateMatchInput) =>
    request<CreateMatchResult>("/api/matches", {
      method: "POST",
      body: {
        mapId: input.mapId,
        settings: {
          fogEnabled: false,
          turnDeadline: input.turnDeadline,
          dayLimit: input.dayLimit,
        },
      },
    }),

  /**
   * Join by invitation code. When `matchId` is omitted the server resolves the
   * match from the unique code (`POST /api/matches/join`).
   */
  joinMatch: (code: string, matchId?: string) =>
    request<JoinMatchResult>(
      matchId === undefined
        ? "/api/matches/join"
        : `/api/matches/${encodeURIComponent(matchId)}/join`,
      { method: "POST", body: { code: code.trim().toUpperCase() } },
    ),

  selectCommander: (matchId: string, commanderId: string) =>
    request<CommanderSelectResult>(
      `/api/matches/${encodeURIComponent(matchId)}/commander`,
      { method: "POST", body: { commanderId } },
    ),

  readyUp: (matchId: string) =>
    request<ReadyResult>(`/api/matches/${encodeURIComponent(matchId)}/ready`, {
      method: "POST",
      body: {},
    }),

  cancelMatch: (matchId: string) =>
    request<CancelResult>(
      `/api/matches/${encodeURIComponent(matchId)}/cancel`,
      { method: "POST", body: {} },
    ),

  submitAction: (matchId: string, action: ActionBody) =>
    request<ActionResult>(
      `/api/matches/${encodeURIComponent(matchId)}/actions`,
      { method: "POST", body: action },
    ),

  getEvents: (matchId: string, since = 0) =>
    request<{ matchId: string; events: PlayerEvent[] }>(
      `/api/matches/${encodeURIComponent(matchId)}/events?since=${since}`,
    ),

  getNotificationPreferences: () =>
    request<NotificationPreferences>("/api/me/notifications"),

  updateNotificationPreferences: (patch: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>("/api/me/notifications", {
      method: "PATCH",
      body: patch,
    }),
};
