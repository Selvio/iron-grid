/**
 * Shared helpers for the per-file schema parsers.
 *
 * Each parser runs a Zod schema for **shape** and then plain-TypeScript
 * **semantic** checks for the intra-file obligations a schema cannot express
 * (cardinalities, cross-entry consistency). Both failure kinds surface as a
 * `GameDataError` so the loader fails closed with a path-precise message
 * (`m1-game-data.md` §3).
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */

import type { ZodError, ZodType } from "zod";

import { GameDataError, type GameDataIssue } from "../errors";

/** Convert a Zod validation error into located game-data issues. */
export function zodIssues(file: string, error: ZodError): GameDataIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.length > 0 ? issue.path.join(".") : null,
    reason: issue.message,
  }));
}

/**
 * Validate `raw` against `schema`, throwing a `GameDataError` (not a `ZodError`)
 * on failure so every fault in the file carries its originating file name.
 */
export function parseShape<T>(
  file: string,
  schema: ZodType<T>,
  raw: unknown,
): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new GameDataError(zodIssues(file, result.error));
  return result.data;
}

/**
 * Accumulate semantic issues for one file and throw them together if any were
 * found. Keeps a parser's cross-entry checks aggregating rather than
 * failing on the first fault.
 */
export class IssueCollector {
  private readonly issues: GameDataIssue[] = [];

  constructor(private readonly file: string) {}

  /** Record a problem at `path` (dotted, within the file) if `condition` is false. */
  check(condition: boolean, path: string | null, reason: string): void {
    if (!condition) this.issues.push({ file: this.file, path, reason });
  }

  /** Throw a `GameDataError` if any issue was collected; otherwise return. */
  throwIfAny(): void {
    if (this.issues.length > 0) throw new GameDataError(this.issues);
  }
}
