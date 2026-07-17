import type { MatchState } from "game-engine";
import { describe, expect, it } from "vitest";

import { deadlineExpired, isClaimEligible } from "../claim-eligibility";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const DEADLINE = "2026-07-16T12:00:00.000Z"; // in the past relative to NOW
const FUTURE = "2026-07-18T12:00:00.000Z";
const BEFORE_DEADLINE = "2026-07-16T11:00:00.000Z";
const AFTER_DEADLINE = "2026-07-16T13:00:00.000Z";

function stateWith(
  turnDeadlineAt: string | null,
  lastActionAt: string | null | undefined,
): MatchState {
  return { match: { turnDeadlineAt, lastActionAt } } as unknown as MatchState;
}

describe("deadlineExpired", () => {
  it("is false for a null deadline and a future deadline", () => {
    expect(deadlineExpired(stateWith(null, null), NOW)).toBe(false);
    expect(deadlineExpired(stateWith(FUTURE, null), NOW)).toBe(false);
  });

  it("is true once the deadline has passed", () => {
    expect(deadlineExpired(stateWith(DEADLINE, null), NOW)).toBe(true);
  });
});

describe("isClaimEligible", () => {
  it("is not eligible before the deadline passes", () => {
    expect(isClaimEligible(stateWith(FUTURE, null), NOW)).toBe(false);
    expect(isClaimEligible(stateWith(null, null), NOW)).toBe(false);
  });

  it("is eligible when the deadline passed and no action followed it", () => {
    expect(isClaimEligible(stateWith(DEADLINE, null), NOW)).toBe(true);
    expect(isClaimEligible(stateWith(DEADLINE, undefined), NOW)).toBe(true);
    expect(isClaimEligible(stateWith(DEADLINE, BEFORE_DEADLINE), NOW)).toBe(
      true,
    );
  });

  it("is revoked by an action committed after the deadline", () => {
    expect(isClaimEligible(stateWith(DEADLINE, AFTER_DEADLINE), NOW)).toBe(
      false,
    );
  });
});
