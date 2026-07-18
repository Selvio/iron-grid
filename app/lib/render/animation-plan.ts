import type { Coordinate } from "game-engine";

import type { PlayerEvent } from "@/app/lib/api-client";

/**
 * Resolved-event animation plan (M10-T8).
 *
 * Maps the server's resolved `player_events` into an ordered list of animation
 * steps the Phaser scene plays (`frontend.md` §7; `game-specification.md` §28).
 * The client **animates** the authoritative result — it never simulates it, and
 * animation completion never gates gameplay (§28.2): the state is already
 * applied before the plan runs. Events with no sprite frames (capture, supply,
 * repair, load/unload, produce — §28.3) map to `effect` overlays built from
 * tweens/particles, **never** invented art. When reduced motion is preferred the
 * plan is empty — the refetched view shows the result with no animation
 * (`game-specification.md` §27.4). Pure and unit-tested.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T8)
 */

export type AnimationStep =
  | {
      readonly kind: "move";
      readonly unitId: string;
      readonly path: readonly Coordinate[];
    }
  | {
      readonly kind: "attack";
      readonly attackerUnitId: string;
      readonly defenderUnitId: string;
      readonly damage: number;
      readonly defenderHpAfter: number;
    }
  | { readonly kind: "destroy"; readonly unitId: string }
  | { readonly kind: "dive" | "surface"; readonly unitId: string }
  | { readonly kind: "effect"; readonly label: string };

/** Frameless events that fall back to a tween/particle/overlay (§28.3). */
const EFFECT_LABEL: Record<string, string> = {
  capture_started: "capture",
  capture_progressed: "capture",
  property_captured: "capture",
  unit_supplied: "supply",
  unit_resupplied: "supply",
  unit_repaired: "repair",
  unit_loaded: "load",
  unit_unloaded: "unload",
  unit_produced: "produce",
};

function step(event: PlayerEvent): AnimationStep | null {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "unit_moved":
      return {
        kind: "move",
        unitId: String(payload.unitId),
        path: (payload.path as Coordinate[] | undefined) ?? [],
      };
    case "unit_attacked":
    case "unit_counterattacked":
      return {
        kind: "attack",
        attackerUnitId: String(payload.attackerUnitId),
        defenderUnitId: String(payload.defenderUnitId),
        damage: Number(payload.damage ?? 0),
        defenderHpAfter: Number(payload.defenderHpAfter ?? 0),
      };
    case "unit_destroyed":
    case "cargo_destroyed":
      return { kind: "destroy", unitId: String(payload.unitId) };
    case "submarine_dived":
      return { kind: "dive", unitId: String(payload.unitId) };
    case "submarine_surfaced":
      return { kind: "surface", unitId: String(payload.unitId) };
    default: {
      const label = EFFECT_LABEL[event.type];
      return label === undefined ? null : { kind: "effect", label };
    }
  }
}

/** True when the viewer's OS asks for reduced motion (`frontend.md` §10). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function buildAnimationPlan(
  events: readonly PlayerEvent[],
  options: { readonly reducedMotion: boolean },
): AnimationStep[] {
  if (options.reducedMotion) return [];
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const steps: AnimationStep[] = [];
  for (const event of ordered) {
    const built = step(event);
    if (built !== null) steps.push(built);
  }
  return steps;
}

/**
 * A move plan built from the client's just-submitted path. Under fog-off (all
 * current matches) the submitted path equals the server's resolved `unit_moved`
 * path, so this animates the same tiles the authoritative event carries without
 * an events round-trip. Empty under reduced motion (snap, no walk). When fog
 * lands, switch the source to `getEvents` + `buildAnimationPlan`.
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */
export function submittedMovePlan(
  unitId: string,
  path: readonly Coordinate[],
  options: { readonly reducedMotion: boolean },
): AnimationStep[] {
  if (options.reducedMotion) return [];
  return [{ kind: "move", unitId, path }];
}

/**
 * An attack plan built from the client's just-submitted action: the optional walk
 * to the firing tile (only when the path is a real move), then the attack beat on
 * the defender. Like `submittedMovePlan` this animates the committed action while
 * the refetch reconciles the authoritative result; the true damage/HP come from
 * the resolved event, so the pre-submit beat carries neutral placeholders (the
 * scene only flashes the defender). Empty under reduced motion.
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */
export function submittedAttackPlan(
  attackerUnitId: string,
  path: readonly Coordinate[],
  defenderUnitId: string,
  options: { readonly reducedMotion: boolean },
): AnimationStep[] {
  if (options.reducedMotion) return [];
  const steps: AnimationStep[] = [];
  if (path.length > 1) {
    steps.push({ kind: "move", unitId: attackerUnitId, path });
  }
  steps.push({
    kind: "attack",
    attackerUnitId,
    defenderUnitId,
    damage: 0,
    defenderHpAfter: 0,
  });
  return steps;
}
