import { describe, expect, it } from "vitest";

import { RateLimitedError } from "../errors";
import { createInvitationRateLimiter } from "../rate-limit";

describe("createInvitationRateLimiter", () => {
  it("allows up to the limit then throws", () => {
    const limiter = createInvitationRateLimiter(2, 1000, () => 0);
    limiter.check("user");
    limiter.check("user");
    expect(() => limiter.check("user")).toThrow(RateLimitedError);
  });

  it("tracks each key independently", () => {
    const limiter = createInvitationRateLimiter(1, 1000, () => 0);
    limiter.check("a");
    expect(() => limiter.check("a")).toThrow(RateLimitedError);
    // A different key has its own budget.
    expect(() => limiter.check("b")).not.toThrow();
  });

  it("resets once the window has passed", () => {
    let now = 0;
    const limiter = createInvitationRateLimiter(1, 1000, () => now);
    limiter.check("user");
    expect(() => limiter.check("user")).toThrow(RateLimitedError);
    // Advance past the window — the earlier hit falls out of scope.
    now = 1001;
    expect(() => limiter.check("user")).not.toThrow();
  });
});
