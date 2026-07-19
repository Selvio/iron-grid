import { audioUrl } from "./sfx";
import { isMuted, subscribeMuted } from "./settings";

/**
 * Background music (M12 audio).
 *
 * A single looping track at its own volume, so it sits under the effects rather
 * than competing with them. It is a plain `<audio>` element rather than a
 * decoded buffer, and deliberately not routed through the shared `AudioContext`:
 * two and a half minutes of AAC would cost megabytes of decoded PCM, and
 * touching the context here would build it at mount — before the page has seen
 * a gesture — which is exactly what browsers warn about.
 *
 * Muting **pauses** rather than silences: an inaudible track still burns battery
 * decoding. The subscription means the toggle works while the music is playing,
 * not only when it next starts.
 *
 * @see docs/01-specification/assets-inventory.md §8
 */

/** Under the effects, so a shot always cuts through the track. */
const MUSIC_VOLUME = 0.35;

let element: HTMLAudioElement | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Play, tolerating both refusals: a rejected promise (autoplay policy) and an
 * environment where `play` is a stub returning nothing (jsdom).
 */
function tryPlay(audio: HTMLAudioElement): void {
  try {
    const played: unknown = audio.play();
    if (played instanceof Promise) played.catch(() => undefined);
  } catch {
    // Nothing to do: the next gesture will try again.
  }
}

/**
 * Start (or resume) the loop. Safe to call repeatedly — mounting the battlefield
 * twice must not stack two tracks over each other.
 */
export function startMusic(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  if (element === null) {
    element = new Audio(audioUrl("music_main"));
    element.loop = true;
    element.preload = "none";
    element.volume = MUSIC_VOLUME;
    unsubscribe = subscribeMuted(() => {
      if (element === null) return;
      if (isMuted()) element.pause();
      else tryPlay(element);
    });
  }
  if (isMuted()) return;
  // Refused when the page has not been interacted with yet; the next call after
  // a click succeeds, which is exactly the browser's autoplay contract.
  tryPlay(element);
}

export function stopMusic(): void {
  try {
    element?.pause();
    if (element !== null) element.currentTime = 0;
  } catch {
    // jsdom stubs `pause`; nothing here is worth failing an unmount over.
  }
  unsubscribe?.();
  unsubscribe = null;
  element = null;
}
