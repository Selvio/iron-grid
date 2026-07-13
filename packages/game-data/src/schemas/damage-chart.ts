/**
 * `damage-chart.yaml` schema and intra-file validation.
 *
 * Validates the attacker×defender matrix shape, the `1..125` integer range of
 * every legal entry, the attacker/defender cardinalities and internal coverage,
 * and that each cell's weapon slot agrees with the attacker's weapons and with
 * its automatic selection. Cross-file checks — attacker/defender/weapon IDs
 * resolving in `units.yaml`/`weapons.yaml`, the "no transport-only attacker" and
 * complete-coverage rules — are M1-T5.
 *
 * @see docs/02-data/damage-chart.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */

import { z } from "zod";

import { IssueCollector, parseShape } from "./parse";

/** A single weapon-slot cell: `null` (illegal) or a base-damage entry. */
const weaponValue = z.union([
  z.null(),
  z.looseObject({
    weapon_id: z.string(),
    base_damage: z.int().min(1).max(125),
  }),
]);

/** Which weapon slot combat auto-selects, or `null` when the attack is illegal. */
const selection = z.enum(["primary", "secondary"]).nullable();

/** One attacker→defender matchup. */
const matchup = z.looseObject({
  defender_id: z.string(),
  weapon_values: z.looseObject({
    primary: weaponValue.optional(),
    secondary: weaponValue.optional(),
  }),
  automatic_selection: selection.optional(),
  automatic_selection_by_state: z
    .object({ surfaced: selection, submerged: selection })
    .optional(),
});

/** One armed attacker and its matchups against every defender. */
const attacker = z.looseObject({
  unit_id: z.string(),
  weapons: z.looseObject({
    primary: z.string().optional(),
    secondary: z.string().optional(),
  }),
  matchups: z.record(z.string(), matchup),
});

/** The top-level `damage-chart.yaml` document. */
const damageChartFile = z.looseObject({
  attacker_order: z.array(z.string()),
  defender_order: z.array(z.string()),
  attackers: z.record(z.string(), attacker),
  matrix_integrity: z.looseObject({
    armed_attacker_count: z.int(),
    unit_defender_count: z.int(),
    special_defender_count: z.int(),
    total_defender_count: z.int(),
  }),
});

/** The validated damage chart. */
export type DamageChart = z.infer<typeof damageChartFile>;

const ARMED_ATTACKERS = 16;
const TOTAL_DEFENDERS = 20; // 19 units + Pipe Seam

/** Assert an auto-selected slot resolves to a non-null cell in `weapon_values`. */
function checkSelectableSlot(
  c: IssueCollector,
  path: string,
  slot: "primary" | "secondary" | null,
  values: z.infer<typeof matchup>["weapon_values"],
): void {
  if (slot === null) return;
  c.check(
    values[slot] != null,
    path,
    `automatic selection points to empty ${slot} slot`,
  );
}

/**
 * Validate `damage-chart.yaml` and return the matrix.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseDamageChart(raw: unknown): DamageChart {
  const file = parseShape("damage-chart.yaml", damageChartFile, raw);
  const c = new IssueCollector("damage-chart.yaml");

  // Cardinalities.
  c.check(
    file.attacker_order.length === ARMED_ATTACKERS,
    "attacker_order",
    `expected ${ARMED_ATTACKERS} armed attackers, found ${file.attacker_order.length}`,
  );
  c.check(
    file.defender_order.length === TOTAL_DEFENDERS,
    "defender_order",
    `expected ${TOTAL_DEFENDERS} defenders, found ${file.defender_order.length}`,
  );

  const attackerKeys = Object.keys(file.attackers);
  const orderSet = new Set(file.attacker_order);
  c.check(
    orderSet.size === attackerKeys.length &&
      attackerKeys.every((k) => orderSet.has(k)),
    "attacker_order",
    "attacker_order and the attackers map disagree",
  );

  const mi = file.matrix_integrity;
  c.check(
    mi.armed_attacker_count === ARMED_ATTACKERS,
    "matrix_integrity.armed_attacker_count",
    `must be ${ARMED_ATTACKERS}`,
  );
  c.check(
    mi.total_defender_count === TOTAL_DEFENDERS,
    "matrix_integrity.total_defender_count",
    `must be ${TOTAL_DEFENDERS}`,
  );
  c.check(
    mi.unit_defender_count + mi.special_defender_count ===
      mi.total_defender_count,
    "matrix_integrity",
    "defender counts are inconsistent",
  );
  c.check(
    mi.total_defender_count === file.defender_order.length,
    "matrix_integrity.total_defender_count",
    "disagrees with defender_order length",
  );

  // Per-attacker coverage and cell consistency.
  const defenderSet = new Set(file.defender_order);
  for (const [aid, a] of Object.entries(file.attackers)) {
    c.check(
      a.unit_id === aid,
      `attackers.${aid}.unit_id`,
      `unit_id "${a.unit_id}" does not match key "${aid}"`,
    );

    for (const defender of file.defender_order) {
      c.check(
        defender in a.matchups,
        `attackers.${aid}.matchups`,
        `missing matchup versus "${defender}"`,
      );
    }

    for (const [did, m] of Object.entries(a.matchups)) {
      const base = `attackers.${aid}.matchups.${did}`;
      c.check(defenderSet.has(did), base, `unknown defender "${did}"`);
      c.check(
        m.defender_id === did,
        `${base}.defender_id`,
        `defender_id "${m.defender_id}" does not match key "${did}"`,
      );

      for (const slot of ["primary", "secondary"] as const) {
        const cell = m.weapon_values[slot];
        if (cell != null) {
          c.check(
            a.weapons[slot] === cell.weapon_id,
            `${base}.weapon_values.${slot}`,
            `weapon_id "${cell.weapon_id}" is not the attacker's ${slot} weapon`,
          );
        }
      }

      if (m.automatic_selection !== undefined) {
        checkSelectableSlot(
          c,
          `${base}.automatic_selection`,
          m.automatic_selection,
          m.weapon_values,
        );
      }
      if (m.automatic_selection_by_state !== undefined) {
        checkSelectableSlot(
          c,
          `${base}.automatic_selection_by_state.surfaced`,
          m.automatic_selection_by_state.surfaced,
          m.weapon_values,
        );
        checkSelectableSlot(
          c,
          `${base}.automatic_selection_by_state.submerged`,
          m.automatic_selection_by_state.submerged,
          m.weapon_values,
        );
      }
    }
  }

  c.throwIfAny();
  return file;
}
