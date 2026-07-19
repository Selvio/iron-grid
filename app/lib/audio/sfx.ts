import { isMuted } from "./settings";

/**
 * Sound effects (M12 audio).
 *
 * One seam for the whole app: the React panels and the Phaser scene both call
 * `playSfx`. Deliberately *not* Phaser's sound manager — that would tie audio to
 * the scene's lifecycle and leave the menus, which live in React, without a
 * voice.
 *
 * The `AudioContext` is created on first play. Every sound this game makes is
 * the answer to a click or a key, so by then the page has the gesture browsers
 * require before they allow audio, and a player who never interacts never has a
 * context built for them. Capability is checked before use — the same guard
 * `prefersReducedMotion` uses in `app/lib/render/animation-plan.ts` — so jsdom,
 * SSR and locked-down browsers get a silent no-op rather than an exception.
 *
 * @see docs/01-specification/assets-inventory.md §8
 */

/** Every effect the board can make, and the file it comes from. */
export const SFX = {
  select_foot: "select_foot",
  select_wheels: "select_wheels",
  select_artillery: "select_artillery",
  select_treads: "select_treads",
  select_air: "select_air",
  select_naval: "select_naval",
  attack_rifle: "attack_rifle",
  attack_bazooka: "attack_bazooka",
  attack_recon: "attack_recon",
  attack_cannon: "attack_cannon",
  attack_tank: "attack_tank",
  attack_air: "attack_air",
  attack_naval: "attack_naval",
  attack_default: "attack_default",
  explosion: "explosion",
  new_day_1: "new_day_1",
  new_day_2: "new_day_2",
  new_day_3: "new_day_3",
  new_day_4: "new_day_4",
  ui_confirm: "ui_confirm",
} as const;

export type SfxId = keyof typeof SFX;

const AUDIO_BASE = "/game-assets/audio";
/** Effects sit under full scale so a burst of them never clips. */
const SFX_GAIN = 0.7;

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

/** The shared context, or null where Web Audio is unavailable. */
export function audioContext(): AudioContext | null {
  if (context !== null) return context;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  context = new Ctor();
  return context;
}

export function audioUrl(name: string): string {
  return `${AUDIO_BASE}/${name}.m4a`;
}

/** Fetch + decode once; later plays reuse the buffer. */
async function load(name: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached !== undefined) return cached;
  const inFlight = loading.get(name);
  if (inFlight !== undefined) return inFlight;

  const ctx = audioContext();
  if (ctx === null) return null;
  const request = (async () => {
    try {
      const response = await fetch(audioUrl(name));
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      buffers.set(name, buffer);
      return buffer;
    } catch {
      // A missing or undecodable sound must never take down a turn.
      return null;
    } finally {
      loading.delete(name);
    }
  })();
  loading.set(name, request);
  return request;
}

/**
 * Play one effect. Fire-and-forget: nothing in the game may wait on audio, so
 * the first play of a sound is silent while it decodes rather than delaying the
 * action that asked for it.
 */
export function playSfx(id: SfxId, gain = SFX_GAIN): void {
  if (isMuted()) return;
  const ctx = audioContext();
  if (ctx === null) return;
  void load(SFX[id]).then((buffer) => {
    // Re-checked after the await: the player may have hit mute meanwhile.
    if (buffer === null || isMuted() || ctx.state === "closed") return;
    if (ctx.state === "suspended") void ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(ctx.destination);
    source.start();
  });
}

/** One of the four new-day stings, as the source project picked them: at random. */
export function playNewDay(): void {
  const stings: SfxId[] = ["new_day_1", "new_day_2", "new_day_3", "new_day_4"];
  playSfx(stings[Math.floor(Math.random() * stings.length)]!);
}
