import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: the pure engine must never declare a framework or runtime dependency —
 * its independence is what keeps it deterministic and testable in isolation.
 *
 * The canonical list is `rules.yaml` → `engine_contract.forbidden_dependencies`;
 * it is mirrored here so the guard has no dependency of its own. Keep the two in
 * sync when the contract changes.
 *
 * @see docs/02-data/rules.yaml → engine_contract.forbidden_dependencies
 * @see docs/03-architecture/architecture.md §4
 */
const FORBIDDEN_DEPENDENCIES = [
  "next",
  "react",
  "phaser",
  "drizzle-orm",
  "pg",
  "@neondatabase/serverless",
  "resend",
  "@auth/core",
] as const;

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

describe("game-engine package purity", () => {
  it("declares none of the forbidden dependencies", () => {
    const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;

    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);

    const violations = FORBIDDEN_DEPENDENCIES.filter((dep) => declared.has(dep));
    expect(violations).toEqual([]);
  });
});
