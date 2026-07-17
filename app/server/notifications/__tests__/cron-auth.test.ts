import { afterEach, describe, expect, it, vi } from "vitest";

import { isCronAuthorized } from "../cron-auth";

describe("isCronAuthorized", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the matching bearer token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-token");
    expect(isCronAuthorized("Bearer s3cret-token")).toBe(true);
  });

  it("rejects a wrong token, an absent header and a length mismatch", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-token");
    expect(isCronAuthorized("Bearer wrong-token!")).toBe(false); // same length, differs
    expect(isCronAuthorized(null)).toBe(false);
    expect(isCronAuthorized("Bearer s3cret-toke")).toBe(false); // shorter
  });

  it("fails closed (throws) when the secret is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(() => isCronAuthorized("Bearer anything")).toThrow();
  });
});
