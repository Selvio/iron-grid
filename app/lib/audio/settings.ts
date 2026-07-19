/**
 * Sound preference (M12 audio).
 *
 * Muting is a property of the device, not of the account — the same player wants
 * sound at home and silence in a meeting — so it lives in `localStorage` and
 * never touches the server. An external store with `subscribe` lets React read
 * it through `useSyncExternalStore` instead of keeping a second copy in state
 * that can drift from what the audio module actually does.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

const STORAGE_KEY = "iron-grid:muted";

let muted: boolean | null = null;
const listeners = new Set<() => void>();

/** Whether sound is currently off. Defaults to on, and to on where there is no storage. */
export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // Private browsing and blocked storage both throw; sound simply does not
      // persist, which is better than failing to start.
      muted = false;
    }
  }
  return muted;
}

/** Server snapshot: no storage there, and audio never plays, so sound is "on". */
export function isMutedServer(): boolean {
  return false;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Preference is kept in memory for this session.
  }
  for (const listener of listeners) listener();
}

export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget the cached value so each case starts from storage. */
export function resetMutedCache(): void {
  muted = null;
}
