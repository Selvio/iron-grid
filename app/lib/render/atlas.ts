import type { FactionId } from "@/app/components/faction-badge";

import { ATLAS, type AtlasEntry, type AtlasKey } from "./atlas.generated";

/**
 * Sprite-atlas lookups (M12 asset migration).
 *
 * `atlas.generated.ts` is produced by `pnpm atlas` from the raw sheets; this is
 * the hand-written half — resolving a key to a URL + rectangle, filling in the
 * faction slot of unit sheets, and turning an entry into the CSS a DOM element
 * needs to show a single frame. Keeping every pixel offset behind these two
 * modules is what lets the art pack be swapped without touching the renderer.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

export type { AtlasEntry, AtlasKey };
export { ATLAS };

const ASSET_BASE = "/game-assets";
const FACTION_SLOT = "{faction}";

/** The entry for `key`, or null when the pack does not provide it. */
export function atlasEntry(key: string): AtlasEntry | null {
  return (ATLAS as Record<string, AtlasEntry | undefined>)[key] ?? null;
}

/** The entry for `key`; throws for a key the build should have produced. */
export function requireEntry(key: string): AtlasEntry {
  const entry = atlasEntry(key);
  if (entry === null) throw new Error(`Unknown atlas key: ${key}`);
  return entry;
}

/**
 * The public URL of an asset file. Unit sheets carry a `{faction}` slot — the
 * four palettes share one geometry — so they need the owner's faction.
 */
export function assetUrl(file: string, faction?: FactionId): string {
  return `${ASSET_BASE}/${file.replace(FACTION_SLOT, faction ?? "blue")}`;
}

/** The public URL of the sheet an entry is cut from. */
export function atlasUrl(entry: AtlasEntry, faction?: FactionId): string {
  return assetUrl(entry.file, faction);
}

/** Every distinct sheet URL an entry set touches, for preloading. */
export function sheetUrls(faction: FactionId): string[] {
  const urls = new Set<string>();
  for (const entry of Object.values(ATLAS)) urls.add(atlasUrl(entry, faction));
  return [...urls];
}

/**
 * Inline styles that show one atlas frame in a DOM element, scaled by `scale`.
 * The crop keeps its source pixel size and is scaled with `transform` — a
 * percentage `background-size` would resolve against the element, not the sheet.
 */
export function spriteStyle(
  entry: AtlasEntry,
  faction?: FactionId,
  scale = 1,
): { outer: React.CSSProperties; inner: React.CSSProperties } {
  return {
    outer: {
      width: entry.w * scale,
      height: entry.h * scale,
      overflow: "hidden",
    },
    inner: {
      width: entry.w,
      height: entry.h,
      backgroundImage: `url(${atlasUrl(entry, faction)})`,
      backgroundPosition: `-${entry.x}px -${entry.y}px`,
      backgroundRepeat: "no-repeat",
      imageRendering: "pixelated",
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    },
  };
}

/** Atlas keys that start with `prefix`, in generated (alphabetical) order. */
export function keysWithPrefix(prefix: string): AtlasKey[] {
  return (Object.keys(ATLAS) as AtlasKey[]).filter((key) =>
    key.startsWith(prefix),
  );
}

/**
 * The frames of one unit clip, longest-prefix first: `unit_<unit>_<animation>_N`.
 * Empty when the pack has no art for that clip — callers fall back to idle.
 */
export function clipFrames(unit: string, animation: string): AtlasEntry[] {
  return keysWithPrefix(`unit_${unit}_${animation}_`).map((key) => ATLAS[key]);
}
