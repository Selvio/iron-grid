import { notFound } from "next/navigation";

import type { FactionId } from "@/app/components/faction-badge";
import {
  ATLAS,
  atlasUrl,
  spriteStyle,
  type AtlasEntry,
} from "@/app/lib/render/atlas";

/**
 * Atlas contact sheet (development only).
 *
 * `pnpm atlas` derives every sprite rectangle from the raw sheets; this page is
 * how that output gets approved before the renderer trusts it — each entry is
 * drawn at 3× with its key, so a bad crop (a unit merged with its neighbour, a
 * mis-seeded walk cycle) is obvious at a glance. Blocked in production: it ships
 * no game state, but it is a debugging tool, not a page.
 *
 * @see scripts/build-atlas.ts
 */

const FACTIONS: readonly FactionId[] = ["blue", "red", "green", "yellow"];

/** Entries grouped by their key prefix (`unit_infantry_idle_0` → `unit_infantry`). */
function groupOf(key: string): string {
  const parts = key.split("_");
  if (key.startsWith("unit_")) return parts.slice(0, 2).join("_");
  if (key.startsWith("building_")) return parts.slice(0, 2).join("_");
  if (key.startsWith("terrain_")) return "terrain";
  if (key.startsWith("fx_")) return parts.slice(0, 2).join("_");
  return parts[0] ?? key;
}

function Frame({
  entry,
  label,
  faction,
}: {
  entry: AtlasEntry;
  label: string;
  faction: FactionId;
}) {
  const { outer, inner } = spriteStyle(entry, faction, 3);
  return (
    <figure className="flex w-28 flex-col items-center gap-1">
      <div
        className="grid place-items-center rounded-md border border-white/10 bg-[#141a24] p-1"
        style={{ minWidth: 56, minHeight: 56 }}
      >
        <span style={outer}>
          <span className="block" style={inner} />
        </span>
      </div>
      <figcaption className="break-all text-center font-mono text-[10px] leading-3 text-white/60">
        {label}
      </figcaption>
    </figure>
  );
}

export default function AtlasPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const groups = new Map<string, [string, AtlasEntry][]>();
  for (const [key, entry] of Object.entries(ATLAS)) {
    const group = groupOf(key);
    groups.set(group, [...(groups.get(group) ?? []), [key, entry]]);
  }
  const unitGroups = [...groups.keys()].filter((g) => g.startsWith("unit_"));

  return (
    <main className="min-h-screen bg-[#0d1117] p-8 text-white">
      <h1 className="font-display text-2xl font-extrabold">Sprite atlas</h1>
      <p className="mt-1 text-sm text-white/60">
        {Object.keys(ATLAS).length} entries from{" "}
        <code className="font-mono">pnpm atlas</code>. Units are shown in every
        faction palette; everything else once.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Faction palettes</h2>
        <div className="mt-3 flex flex-wrap gap-6">
          {FACTIONS.map((faction) => (
            <div key={faction}>
              <div className="mb-2 font-mono text-xs uppercase text-white/50">
                {faction}
              </div>
              <div className="flex flex-wrap gap-2">
                {unitGroups.map((group) => {
                  const first = groups
                    .get(group)!
                    .find(([key]) => key.includes("_idle_0"));
                  return first === undefined ? null : (
                    <Frame
                      key={`${faction}-${group}`}
                      entry={first[1]}
                      faction={faction}
                      label={group.replace("unit_", "")}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {[...groups.entries()].map(([group, entries]) => (
        <section key={group} className="mt-8">
          <h2 className="font-display text-lg font-bold">{group}</h2>
          <div className="mt-1 font-mono text-[11px] text-white/40">
            {atlasUrl(entries[0]![1], "blue")}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {entries.map(([key, entry]) => (
              <Frame key={key} entry={entry} faction="blue" label={key} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
