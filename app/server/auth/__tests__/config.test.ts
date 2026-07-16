import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthConfig } from "../config";

/**
 * `buildAuthConfig` shape guard (M5-T1/T2, hardened during M5 verification).
 *
 * Exercises the lazily-built config with stubbed secrets (no network I/O — the
 * Neon pool connects only on first query). Confirms the runtime wiring the auth
 * contract depends on: database sessions, the trusted host that keeps the
 * magic-link callback working when self-hosted, and the registered provider.
 */
describe("buildAuthConfig", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses database sessions and trusts the deployment host", () => {
    const config = buildAuthConfig();
    expect(config.session?.strategy).toBe("database");
    expect(config.trustHost).toBe(true);
    expect(config.secret).toBe("test-secret");
  });

  it("registers exactly the magic-link email provider", () => {
    const config = buildAuthConfig();
    expect(config.providers).toHaveLength(1);
    const [provider] = config.providers;
    // Provider entries are config objects here (not yet normalized by NextAuth).
    expect(provider).toMatchObject({ id: "magic-link", type: "email" });
  });
});
