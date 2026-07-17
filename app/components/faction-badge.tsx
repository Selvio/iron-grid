import { Shield, Sprout, Sun, Swords, type LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/app/lib/utils";

/**
 * Faction identity chip (M9-T1).
 *
 * Faction identity is color **paired with a distinct insignia**, never color
 * alone (`game-specification.md` §27.4, `frontend.md` §10). Each faction gets a
 * distinct silhouette *and* a text label, so identity survives color-blindness
 * and monochrome rendering. Labels are the neutral color word — commander and
 * faction **names** are design-blocked (§33.1), so nothing here invents one.
 */

export type FactionId = "blue" | "green" | "red" | "yellow";

interface FactionMeta {
  label: string;
  Icon: LucideIcon;
  colorClass: string;
}

const FACTIONS: Record<FactionId, FactionMeta> = {
  blue: { label: "Blue", Icon: Shield, colorClass: "text-faction-blue" },
  green: { label: "Green", Icon: Sprout, colorClass: "text-faction-green" },
  red: { label: "Red", Icon: Swords, colorClass: "text-faction-red" },
  yellow: { label: "Yellow", Icon: Sun, colorClass: "text-faction-yellow" },
};

export function FactionBadge({
  faction,
  className,
  showLabel = true,
}: {
  faction: FactionId;
  className?: string;
  showLabel?: boolean;
}) {
  const meta = FACTIONS[faction];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        meta.colorClass,
        className,
      )}
    >
      <meta.Icon aria-hidden="true" className="size-4" />
      <span className={cn(!showLabel && "sr-only")}>{meta.label}</span>
    </span>
  );
}
