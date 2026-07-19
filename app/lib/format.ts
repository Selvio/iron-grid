/**
 * Shared display formatters (M9-T1).
 *
 * Funds in a generic currency `G`, HP on the 0–10 scale, deadlines as
 * countdowns (`design-reference.md` §4). Pure and clock-injected — pass `now`
 * so components and tests stay deterministic.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */

/** Funds shown in the generic currency `G`, thousands-grouped. */
export function formatFunds(amount: number): string {
  return `${amount.toLocaleString("en-US")} G`;
}

/** HP is rendered on the 0–10 scale (`design-reference.md` §4). */
export function formatHp(hp: number): string {
  return `${Math.max(0, Math.min(10, Math.round(hp)))}`;
}

/**
 * A map id as a human-readable name (M9-T9).
 *
 * `maps.yaml` carries no display-name field — the id *is* the name — so the
 * dashboard title-cases the slug (`crossfire-basin` → `Crossfire Basin`) rather
 * than inventing one. When a display name lands in the schema, this goes away.
 */
export function formatMapName(mapId: string): string {
  return mapId
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * A turn deadline as a compact countdown from `now`. `null` (a `"none"`
 * deadline) reads "No deadline"; a passed deadline reads "Overdue".
 */
export function formatCountdown(deadlineAt: string | null, now: Date): string {
  if (deadlineAt === null) return "No deadline";
  const remainingMs = new Date(deadlineAt).getTime() - now.getTime();
  if (remainingMs <= 0) return "Overdue";

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
