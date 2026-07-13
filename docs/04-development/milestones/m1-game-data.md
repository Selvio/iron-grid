# Iron Grid — M1 · Game-data pipeline & validation (tickets)

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Data, engine and backend contributors

> This is the **execution-detail** breakdown of milestone **M1** from `roadmap.md`
> — one ticket per unit of work, each expanded to satisfy `definition-of-ready.md`.
> It **references** rather than restates the rules: the milestone's place in the
> plan is in `roadmap.md` §5; the pipeline shape is `architecture.md` §6; the
> canonical validation contract is `game-specification.md` §31.1 and each data
> file's own `required_validation_tests:` / `cross_file_contracts:` blocks; the
> test layer is `testing.md` §4; the quality bar is `coding-standards.md` §11–§12.

---

# 1. Purpose

M1 turns the eight canonical `docs/02-data/*.yaml` files into a **typed, versioned
`GameData` object** that the engine receives on every call (`architecture.md` §6).
It does this by giving the `game-data` package (skeleton from M0-T2) its two real
jobs:

1. **Parse + schema-validate** every data file with Zod.
2. **Enforce the §31.1 integrity checks** — unique IDs, cross-file references,
   complete damage coverage, map integrity — so that **invalid data never reaches
   the engine** and a validation failure is a **build failure, not a warning**
   (`testing.md` §4).

No gameplay logic is built here — M1 produces data, not behavior. The engine's
nine functions land in M2–M3 and consume the `GameData` this milestone produces.

**Current state** (starting point): `packages/game-data` is the M0 skeleton — it
has `zod` + `js-yaml` (v5, which ships its own types) as dependencies and a single
placeholder export (`GAME_DATA_PACKAGE`). The eight canonical YAML files exist and
are authoritative; `commanders.yaml` is `design-blocked` (schema and four slots
present, values intentionally unresolved — §33.1) and `maps.yaml` has
`official_maps: {}` (schema present, no official map designed yet).

---

# 2. Gates for M1

- **Entry (DoR):** each ticket below is specified with goal, scope, files and
  acceptance; the data it validates already exists and is canonical. No §33 design
  blocker touches M1 — the commander and map **schemas** are validated here; their
  unresolved **values** are not required (`commanders.yaml` stays design-blocked,
  `official_maps` stays empty) and M1 must pass green in that state.
- **Exit (DoD):** the **code-change bar** (`coding-standards.md` §11–§12: `tsc`,
  `pnpm lint`, `pnpm spell`) plus the **data-validation test layer**
  (`testing.md` §4): every `required_validation_tests:` obligation across the eight
  files is covered by a test, valid data loads, and each targeted invalid fixture
  trips exactly the failure it should. The milestone-level DoD is in §5.

---

# 3. Cross-cutting decisions

- **The package reads, it never copies** (`architecture.md` §6): the loader resolves
  the real `docs/02-data/*.yaml` from the repo root; the YAML is *simultaneously*
  the human spec and the machine source. No data value is duplicated into TypeScript.
- **Fail closed.** Every validation error is thrown (aggregated with the offending
  file, path and reason), never logged-and-continued. `loadGameData()` either returns
  a fully valid `GameData` or throws. This is what makes a bad file a build failure.
- **Schema vs. integrity are two layers.** *Schema* (Zod) checks the shape of one
  file in isolation (enums, ranges, required keys, unique IDs). *Integrity* checks
  span files (cross-references, damage coverage, HQ ownership) and run after all
  schemas pass. Keeping them separate keeps error messages precise.
- **Design-blocked is a first-class state, not an error.** `commanders.yaml`'s
  `design-blocked` status and empty `official_maps` are **valid** inputs: the schema
  and the "no commander enabled while blocked" / "no map published without approved
  balance" rules are validated; the absence of resolved values is not a failure. The
  real commander/map values land later (M6 / M10) behind their §33 ADRs.
- **Version pinning originates here** (`architecture.md` §6, `game-spec` §31.2):
  `GameData` carries an explicit version derived from the files' `schema_version` /
  `document_version`. M1 *produces and stamps* it; the backend *stores and enforces*
  it against active matches (out of scope here).
- **Test depth is focused** (`testing.md` §2, [[testing-depth-preference]]): anchor
  tests to the `required_validation_tests:` lists and the §31.1 checks. One positive
  "valid data loads" test plus one targeted negative fixture per check — do not chase
  matrix-cell-by-matrix-cell coverage.

---

# 4. Tickets

## M1-T1 · Loader scaffold, YAML reading & version stamping
- **Goal:** the plumbing that reads the eight files and assembles a versioned
  `GameData`, before any per-file schema exists.
- **Scope:**
  - A YAML reader (js-yaml v5) that resolves `docs/02-data/` from the repo root
    (robust to being called from the package, the app, or a test) and parses each
    of the eight files.
  - The `GameData` type shape: `{ version, units, weapons, damageChart, terrain,
    properties, commanders, maps, rules }` — one field per canonical file (fields
    typed `unknown`/placeholder until their schema ticket fills them in).
  - `loadGameData()` entry point that composes read → schema → integrity and
    **throws** on any failure; a `GameDataError` aggregating file + path + reason.
  - Version stamping (`game-spec` §31.2): derive and expose `GameData.version` from
    the files' declared versions; assert the eight `schema_version`s agree.
  - Housekeeping: drop the now-redundant `@types/js-yaml` (v5 ships its own types);
    confirm `js-yaml@5` types resolve.
- **Files:** `packages/game-data/src/{load.ts,game-data.ts,paths.ts,errors.ts}`,
  `packages/game-data/src/index.ts`, `packages/game-data/package.json`.
- **Acceptance:** `loadGameData()` reads all eight files and returns an object
  stamped with a version; a missing/renamed file or a version mismatch throws a
  `GameDataError` naming the file. Typechecks with no `@types/js-yaml`.
- **Dependencies:** M0 complete.

## M1-T2 · Combat-core schemas — units, weapons, damage-chart
- **Goal:** Zod schemas + intra-file validation for the three combat-core files.
- **Scope:**
  - `units.yaml`: enums (`movement_type`, category), `defaults`, and the `units`
    map; intra-file checks from its `required_validation_tests:` that need no other
    file — exactly 19 enabled, unique IDs, air-units-never-get-terrain-defense flag,
    indirect-cannot-move-and-attack, produced-unit full state + acted, transport
    cargo/capacity rules, submarine state → daily-fuel/sprite-row.
  - `weapons.yaml`: fire mode, range model, ammo (finite primary pool / infinite
    secondary), `can_fire_after_move` / `can_counterattack` for indirect, per-weapon
    range bands, and the target-class rules (Cruiser/Bomber/Fighter/Missiles/Sub).
  - `damage-chart.yaml`: the attacker×defender matrix shape, value range 1–125,
    `null` = illegal, and the surfaced/submerged submarine columns.
  - Cross-file references (weapon→unit, unit→weapon, matrix↔roster) are **deferred
    to M1-T5**; T2 covers each file in isolation.
- **Files:** `packages/game-data/src/schemas/{units,weapons,damage-chart}.ts`,
  `game-data.ts` (fill the three fields).
- **Acceptance:** the three files parse into typed structures; each intra-file
  obligation in their `required_validation_tests:` is enforced; a fixture violating
  any one throws with a path-precise message.
- **Dependencies:** M1-T1.

## M1-T3 · Board schemas — terrain & properties
- **Goal:** Zod schemas + intra-file validation for terrain and properties.
- **Scope:**
  - `terrain.yaml`: unique IDs, movement-cost keys ∈ supported movement types, the
    per-terrain cost/defense/fog obligations enumerated in its
    `required_validation_tests:` (Plain/Forest/Mountain/River/Road/Bridge/Sea/Reef/
    Shoal/Pipe/Pipe-Seam costs; defense stars; fog concealment; Mountain +3 vision
    for Infantry/Mech), the blocked / derivative-art gate flag, and independent
    logical-vs-render tile references.
  - `properties.yaml`: exactly five types, unique IDs, 20 capture points, 1000
    income, production category lists (Base=11 ground, Airport=4 air, Port=4 naval;
    City/HQ none), repair/resupply categories, neutral-property nulls, capture-unit
    set (Infantry/Mech), and the `rendering_contract` visual-state coverage.
  - Property→terrain and production→unit references are **deferred to M1-T5**.
- **Files:** `packages/game-data/src/schemas/{terrain,properties}.ts`,
  `game-data.ts` (fill the two fields).
- **Acceptance:** both files parse; every intra-file obligation in their
  `required_validation_tests:` is enforced; targeted invalid fixtures throw.
- **Dependencies:** M1-T1.

## M1-T4 · Config schemas — commanders (design-blocked) & maps (empty)
- **Goal:** validate the commander and map **contracts** without requiring the
  unresolved §33.1 values or any designed map.
- **Scope:**
  - `commanders.yaml`: `factions`, `modifier_schema`, `effect_schema`,
    `meter_schema`, `power_schema`, `commander_template` and the four `commanders`
    slots. Enforce the structural obligations from its `required_validation_tests:`
    that hold under `design-blocked` — exactly four factions/slots, one-to-one
    faction↔commander binding, empty faction `gameplay_modifiers`, **no commander
    enabled while blocked / with null display_name / null power cost / unresolved
    meter rules**, no Super-Power field. Modifier/effect enum vocabulary is checked;
    the *scope-reference resolution* (unit/terrain/property targets) is **deferred
    to M1-T5**.
  - `maps.yaml`: `map_schema` and its sub-schemas (`player_slot`, `logical_terrain`,
    `render_layer`, `property_instance`, `starting_unit`, `starting_funds`,
    `supported_match_settings`, `balance`, release gates). Validate the schema and
    the publication/immutability + balance-gate rules. With `official_maps: {}` the
    per-map integrity checks (dimensions, two starts, HQ ownership, no disabled
    units, no blocked terrain) are **implemented but iterate over an empty set** —
    they must be ready to bite the moment a map is added (M10), and M1 proves they
    run on a fixture map.
  - **Design-blocked/empty must pass green** — that is the point of the ticket.
- **Files:** `packages/game-data/src/schemas/{commanders,maps}.ts`,
  `game-data.ts` (fill the two fields).
- **Acceptance:** both files parse in their current (blocked / empty) state and the
  loader is green; enabling a commander while blocked, or publishing a map failing a
  gate, throws — proven with fixtures.
- **Dependencies:** M1-T1.

## M1-T5 · Cross-file integrity & §31.1 checks
- **Goal:** the integrity layer that runs after all schemas pass — every check in
  `game-specification.md` §31.1 and the files' `cross_file_contracts:`.
- **Scope:**
  - Cross-references resolve: unit→weapon and weapon→unit; unit movement_type→
    terrain; production/repair property→unit category; property→terrain; map
    terrain/property/unit references; commander modifier scope refs → their
    canonical file.
  - **Complete damage coverage:** every legal attacker×defender matchup implied by
    weapons/units has a `damage-chart.yaml` entry (and no entry references a unit
    absent from the roster) — the §31.1 "complete 19×19 damage coverage where legal".
  - The remaining enumerated §31.1 checks that span files: no unknown movement
    types, no unknown property categories, valid sprite-row mapping, map dimensions,
    exactly two player starts, valid HQ ownership, no disabled units in starting
    armies, no blocked terrain in production maps.
  - Errors aggregate (report *all* integrity failures for a file set, not just the
    first) so a data author sees the full list.
- **Files:** `packages/game-data/src/validate/integrity.ts` (+ focused helpers),
  wired into `loadGameData()`.
- **Acceptance:** the real `docs/02-data` set passes every integrity check; a
  fixture breaking any single cross-reference or coverage rule throws a message
  naming the rule and the offending IDs.
- **Dependencies:** M1-T2, M1-T3, M1-T4.

## M1-T6 · Data-validation test suite & fixtures
- **Goal:** the `testing.md` §4 layer — prove valid data loads and each check bites.
- **Scope:**
  - A positive test: `loadGameData()` on the real `docs/02-data` returns a fully
    typed, version-stamped `GameData` with the expected cardinalities (19 units, 5
    property types, 4 commander slots, etc.).
  - Negative fixtures: a small, reusable "valid base" clone with one field mutated
    per check, asserting the specific `GameDataError` — one targeted fixture per
    `required_validation_tests:` obligation and per §31.1 check (focused, not
    exhaustive — [[testing-depth-preference]]).
  - The versioning obligation (§31.2): the stamp is present and derived from the
    files; a version-mismatch fixture fails.
  - Confirm these run under `pnpm test:run` so **CI turns a validation failure into
    a build failure** (`testing.md` §4; CI wired in M0-T7 — no CI change needed).
- **Files:** `packages/game-data/src/**/*.test.ts`, `packages/game-data/test/fixtures/**`.
- **Acceptance:** `pnpm test:run` is green; temporarily corrupting any real data
  file turns the suite red with a precise message; the smoke test from M0-T4 is
  superseded or kept as-is.
- **Dependencies:** M1-T5.

**Ordering:** M1-T1 → (M1-T2 ∥ M1-T3 ∥ M1-T4) → M1-T5 → M1-T6.

---

# 5. Definition of Done for M1

M1 is complete when, from a clean checkout:

1. `pnpm -r typecheck`, `pnpm lint`, `pnpm spell`, `pnpm test:run` and `pnpm build`
   are all green.
2. `loadGameData()` reads the eight canonical `docs/02-data/*.yaml`, Zod-validates
   each, runs every §31.1 / `cross_file_contracts:` integrity check, and returns a
   typed, **version-stamped** `GameData` — or throws a precise `GameDataError`.
3. Every `required_validation_tests:` obligation across the eight files is covered
   by a test, and each targeted invalid fixture trips exactly its own failure.
4. A validation failure is a **build failure**: corrupting any real data file turns
   `pnpm test:run` (and thus CI) red.
5. The pipeline **reads** `docs/02-data`; no data value is duplicated into the
   package. `commanders.yaml` (design-blocked) and empty `official_maps` pass green.

---

# 6. Cross-references

- `roadmap.md` — M1's place in the milestone sequence (§5) and the layered strategy
  (§2); the JIT blocker map (§6) — none applies to M1.
- `architecture.md` — §6 the game-data pipeline this milestone builds; §4 the
  engine contract that consumes `GameData`.
- `game-specification.md` — §31.1 the canonical validation list; §31.2 versioning.
- `docs/02-data/*.yaml` — each file's `required_validation_tests:` and
  `cross_file_contracts:` are the per-file contracts M1 implements.
- `testing.md` — §4 the data-validation test layer and the build-failure rule; §2
  the focused-depth principle.
- `coding-standards.md` — §5 Zod at boundaries, §10 JSDoc, §11–§12 the code bar.
- `definition-of-ready.md` — the entry gate each ticket satisfies.
- `decisions/0001-frontend-ui-and-tooling-stack.md` — Zod as the validation library.
