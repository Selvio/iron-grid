import { handlers } from "@/app/server/auth";

/**
 * Auth.js catch-all route handler (M5-T1).
 *
 * Mounts every `/api/auth/*` endpoint (sign-in, callback, session, sign-out) on
 * the App Router (`backend.md` §3). Pinned to the **Node.js runtime**: the auth
 * flow reaches the transactional database through the Drizzle adapter, which the
 * Edge runtime cannot serve (`backend.md` §2).
 *
 * @see docs/03-architecture/backend.md §2, §3, §7
 * @see docs/04-development/milestones/m5-auth.md (M5-T1)
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
