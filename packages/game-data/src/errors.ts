/**
 * Error types for the game-data pipeline.
 *
 * The loader **fails closed** (`m1-game-data.md` §3): any problem found while
 * reading, schema-checking or integrity-checking `docs/02-data/*.yaml` is thrown
 * as a `GameDataError`, never logged-and-continued. A single error may aggregate
 * many issues so a data author sees every fault in one pass rather than one at a
 * time (`m1-game-data.md` M1-T5).
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T1)
 * @see docs/03-architecture/architecture.md §6 (game-data pipeline)
 */

/** A single problem found in the canonical data, located for a data author. */
export interface GameDataIssue {
  /** Canonical file the issue is in (e.g. `units.yaml`); `null` for whole-set issues. */
  readonly file: string | null;
  /** Dotted path to the offending value within the file, or `null` if not applicable. */
  readonly path: string | null;
  /** Human-readable reason the value is rejected. */
  readonly reason: string;
}

/** Render one issue as `file:path — reason`, omitting the parts that are absent. */
function formatIssue(issue: GameDataIssue): string {
  const location = [issue.file, issue.path]
    .filter((part) => part !== null)
    .join(":");
  return location.length > 0 ? `${location} — ${issue.reason}` : issue.reason;
}

/**
 * A validation failure in the canonical game data. Invalid data must never reach
 * the engine, so this is thrown (and, in CI, turns a build red) rather than
 * returned (`testing.md` §4).
 */
export class GameDataError extends Error {
  /** Every issue aggregated into this error, in discovery order. */
  readonly issues: readonly GameDataIssue[];

  constructor(issues: GameDataIssue | readonly GameDataIssue[]) {
    const list = Array.isArray(issues) ? [...issues] : [issues];
    const heading =
      list.length === 1
        ? "Invalid game data:"
        : `Invalid game data (${list.length} issues):`;
    super(
      [heading, ...list.map((issue) => `  - ${formatIssue(issue)}`)].join("\n"),
    );
    this.name = "GameDataError";
    this.issues = list;
  }
}
