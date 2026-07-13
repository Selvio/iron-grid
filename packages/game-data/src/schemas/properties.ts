/**
 * `properties.yaml` schema and intra-file validation.
 *
 * Validates property shape and the intra-file obligations from the file's
 * `required_validation_tests:`: exactly five types, uniform capture points and
 * income, the producer/repair mapping per type, the capture-eligible unit set,
 * headquarters defeat behavior, and full rendering-state coverage. Property→
 * terrain and production→unit references, and the neutral-ownership runtime
 * rules, are cross-file / engine concerns handled in M1-T5 and M2/M3.
 *
 * @see docs/02-data/properties.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T3)
 */

import { z } from "zod";

import {
  assetStatus,
  productionCategory,
  repairCategory,
  type PropertyType,
  type RepairCategory,
} from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** One property type (`properties.yaml` properties.*). */
const propertySchema = z.looseObject({
  id: z.string(),
  display_name: z.string(),
  terrain_id: z.string(),
  capturable: z.boolean(),
  max_capture_points: z.int(),
  economy: z.looseObject({ income_per_turn: z.int() }),
  production: z.looseObject({
    category: productionCategory,
    allowed_unit_ids: z.array(z.string()),
  }),
  repair: z.looseObject({
    categories: z.array(repairCategory),
    hp_per_turn: z.int(),
    cost_percent_per_displayed_hp: z.int(),
  }),
  capture: z.looseObject({ eligible_unit_ids: z.array(z.string()) }),
  defeat: z.looseObject({ triggers_defeat_on_capture: z.boolean() }),
  rendering: z.looseObject({ asset_status: assetStatus }),
});

/** The top-level `properties.yaml` document. */
const propertiesFile = z.looseObject({
  conventions: z.looseObject({
    capture: z.looseObject({
      default_max_points: z.int(),
      eligible_unit_ids: z.array(z.string()),
    }),
    income: z.looseObject({ amount_per_property: z.int() }),
    repair: z.looseObject({
      max_displayed_hp_per_turn: z.int(),
      cost_percent_per_displayed_hp: z.int(),
    }),
  }),
  properties: z.record(z.string(), propertySchema),
  rendering_contract: z.looseObject({
    required_visual_states: z.record(z.string(), z.array(z.string())),
  }),
});

/** A validated property type. */
export type Property = z.infer<typeof propertySchema>;

/** The validated properties, keyed by property ID. */
export type Properties = Readonly<Record<string, Property>>;

/** The uniform capture points, income, repair rate and cost every property shares. */
const CAPTURE_POINTS = 20;
const INCOME_PER_TURN = 1000;
const REPAIR_HP_PER_TURN = 2;
const REPAIR_COST_PERCENT = 10;
/** Only Infantry and Mech may capture (`properties.yaml` conventions.capture). */
const CAPTURE_UNITS = ["infantry", "mech"] as const;
/** Ownership rendering states; headquarters is never neutral. */
const OWNERSHIP_STATES = new Set(["neutral", "blue", "green", "red", "yellow"]);

/** Per-type production and repair contract (`properties.yaml` required_validation_tests). */
const EXPECTED: Readonly<
  Record<
    PropertyType,
    {
      readonly category: "none" | "ground" | "air" | "naval";
      readonly producedCount: number;
      readonly repair: readonly RepairCategory[];
      readonly defeat: boolean;
    }
  >
> = {
  city: {
    category: "none",
    producedCount: 0,
    repair: ["ground"],
    defeat: false,
  },
  base: {
    category: "ground",
    producedCount: 11,
    repair: ["ground"],
    defeat: false,
  },
  airport: {
    category: "air",
    producedCount: 4,
    repair: ["air"],
    defeat: false,
  },
  port: {
    category: "naval",
    producedCount: 4,
    repair: ["naval"],
    defeat: false,
  },
  headquarters: {
    category: "none",
    producedCount: 0,
    repair: ["ground"],
    defeat: true,
  },
};

/** Whether two string arrays hold the same values in the same order. */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Validate `properties.yaml` and return its properties keyed by ID.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseProperties(raw: unknown): Properties {
  const file = parseShape("properties.yaml", propertiesFile, raw);
  const c = new IssueCollector("properties.yaml");
  const properties = file.properties;
  const expectedTypes = Object.keys(EXPECTED);

  // Exactly the five property types exist.
  const keys = Object.keys(properties);
  c.check(
    keys.length === expectedTypes.length &&
      expectedTypes.every((t) => t in properties),
    "properties",
    `expected exactly the property types [${expectedTypes.join(", ")}], found [${keys.join(", ")}]`,
  );

  // Canonical convention values match the per-property invariants below.
  const conventions = file.conventions;
  c.check(
    conventions.capture.default_max_points === CAPTURE_POINTS,
    "conventions.capture.default_max_points",
    `must be ${CAPTURE_POINTS}`,
  );
  c.check(
    conventions.income.amount_per_property === INCOME_PER_TURN,
    "conventions.income.amount_per_property",
    `must be ${INCOME_PER_TURN}`,
  );
  c.check(
    conventions.repair.max_displayed_hp_per_turn === REPAIR_HP_PER_TURN,
    "conventions.repair.max_displayed_hp_per_turn",
    `must be ${REPAIR_HP_PER_TURN}`,
  );
  c.check(
    conventions.repair.cost_percent_per_displayed_hp === REPAIR_COST_PERCENT,
    "conventions.repair.cost_percent_per_displayed_hp",
    `must be ${REPAIR_COST_PERCENT}`,
  );
  c.check(
    arraysEqual(conventions.capture.eligible_unit_ids, CAPTURE_UNITS),
    "conventions.capture.eligible_unit_ids",
    "only Infantry and Mech may capture",
  );

  for (const [key, p] of Object.entries(properties)) {
    const at = (sub: string): string => `properties.${key}.${sub}`;
    c.check(
      p.id === key,
      at("id"),
      `id "${p.id}" does not match its key "${key}"`,
    );

    // Uniform economy and capture values.
    c.check(
      p.max_capture_points === CAPTURE_POINTS,
      at("max_capture_points"),
      `must be ${CAPTURE_POINTS}`,
    );
    c.check(
      p.economy.income_per_turn === INCOME_PER_TURN,
      at("economy.income_per_turn"),
      `must be ${INCOME_PER_TURN}`,
    );
    c.check(
      p.repair.hp_per_turn === REPAIR_HP_PER_TURN,
      at("repair.hp_per_turn"),
      `must be ${REPAIR_HP_PER_TURN}`,
    );
    c.check(
      p.repair.cost_percent_per_displayed_hp === REPAIR_COST_PERCENT,
      at("repair.cost_percent_per_displayed_hp"),
      `must be ${REPAIR_COST_PERCENT}`,
    );
    c.check(
      arraysEqual(p.capture.eligible_unit_ids, CAPTURE_UNITS),
      at("capture.eligible_unit_ids"),
      "only Infantry and Mech may capture",
    );

    // Per-type production, repair and defeat contract.
    const spec = EXPECTED[key as PropertyType];
    if (spec === undefined) continue; // unknown key already flagged above
    c.check(
      p.production.category === spec.category,
      at("production.category"),
      `must produce category "${spec.category}"`,
    );
    c.check(
      p.production.allowed_unit_ids.length === spec.producedCount,
      at("production.allowed_unit_ids"),
      `must list ${spec.producedCount} produced units, found ${p.production.allowed_unit_ids.length}`,
    );
    c.check(
      arraysEqual(p.repair.categories, spec.repair),
      at("repair.categories"),
      `must repair [${spec.repair.join(", ")}]`,
    );
    c.check(
      p.defeat.triggers_defeat_on_capture === spec.defeat,
      at("defeat.triggers_defeat_on_capture"),
      `must be ${spec.defeat}`,
    );
  }

  // Rendering states cover every property; headquarters is never neutral.
  const rvs = file.rendering_contract.required_visual_states;
  const rvsKeys = Object.keys(rvs);
  c.check(
    rvsKeys.length === expectedTypes.length &&
      expectedTypes.every((t) => t in rvs),
    "rendering_contract.required_visual_states",
    "required visual states must cover exactly the five property types",
  );
  for (const [key, states] of Object.entries(rvs)) {
    const at = `rendering_contract.required_visual_states.${key}`;
    for (const state of states) {
      c.check(
        OWNERSHIP_STATES.has(state),
        at,
        `unknown ownership state "${state}"`,
      );
    }
    if (key === "headquarters") {
      c.check(!states.includes("neutral"), at, "headquarters is never neutral");
    } else {
      c.check(
        states.includes("neutral"),
        at,
        "capturable properties require a neutral state",
      );
    }
  }

  c.throwIfAny();
  return properties;
}
