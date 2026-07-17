import { describe, expect, it } from "vitest";

import { safelyEnqueue } from "../enqueue";

/**
 * M8-T7 — notifications are never gameplay-authoritative
 * (`notifications.gameplay_authority: false`): a scheduling failure is swallowed,
 * so it can never surface as a gameplay error or roll back a committed action.
 */
describe("safelyEnqueue", () => {
  it("swallows a failing enqueue so gameplay is never affected", async () => {
    await expect(
      safelyEnqueue(async () => {
        throw new Error("job store is down");
      }),
    ).resolves.toBeUndefined();
  });

  it("runs a successful enqueue", async () => {
    let ran = false;
    await safelyEnqueue(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
