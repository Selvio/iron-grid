import { describe, expect, it } from "vitest";

import { createRandomSource } from "./random-source";

/**
 * M7-T1 — the counter-based deterministic `RandomSource`.
 *
 * Covers the properties the action pipeline relies on: identical seed+index
 * reproduces every draw (replay), named streams are decorrelated, one draw
 * advances the index by one, and a later start index continues the sequence.
 */
describe("createRandomSource", () => {
  it("is deterministic for the same seed, index, stream and range", () => {
    const a = createRandomSource("seed-1", 0);
    const b = createRandomSource("seed-1", 0);
    const drawsA = Array.from({ length: 8 }, () =>
      a.nextInt("combat_luck", 0, 9),
    );
    const drawsB = Array.from({ length: 8 }, () =>
      b.nextInt("combat_luck", 0, 9),
    );
    expect(drawsA).toEqual(drawsB);
  });

  it("differs across seeds", () => {
    const a = createRandomSource("seed-1", 0);
    const b = createRandomSource("seed-2", 0);
    const seqA = Array.from({ length: 12 }, () =>
      a.nextInt("combat_luck", 0, 99),
    );
    const seqB = Array.from({ length: 12 }, () =>
      b.nextInt("combat_luck", 0, 99),
    );
    expect(seqA).not.toEqual(seqB);
  });

  it("decorrelates named streams at the same indices", () => {
    const luck = createRandomSource("seed-1", 0);
    const counter = createRandomSource("seed-1", 0);
    const luckSeq = Array.from({ length: 16 }, () =>
      luck.nextInt("combat_luck", 0, 999),
    );
    const counterSeq = Array.from({ length: 16 }, () =>
      counter.nextInt("combat_counter_luck", 0, 999),
    );
    expect(luckSeq).not.toEqual(counterSeq);
  });

  it("counts one draw per nextInt call", () => {
    const source = createRandomSource("seed-1", 0);
    expect(source.drawCount).toBe(0);
    source.nextInt("combat_luck", 0, 9);
    source.nextInt("first_player", 0, 1);
    expect(source.drawCount).toBe(2);
  });

  it("continues the sequence from a later start index (replay)", () => {
    const full = createRandomSource("seed-1", 0);
    const drawn = Array.from({ length: 4 }, () =>
      full.nextInt("combat_luck", 0, 9),
    );

    // A source starting at index 3 reproduces the 4th draw of the run above.
    const resumed = createRandomSource("seed-1", 3);
    expect(resumed.nextInt("combat_luck", 0, 9)).toBe(drawn[3]);
  });

  it("keeps every draw within the inclusive range", () => {
    const source = createRandomSource("seed-1", 0);
    for (let i = 0; i < 200; i += 1) {
      const value = source.nextInt("combat_luck", 3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it("returns the single value for a degenerate range and rejects an invalid one", () => {
    const source = createRandomSource("seed-1", 0);
    expect(source.nextInt("combat_luck", 5, 5)).toBe(5);
    expect(() => source.nextInt("combat_luck", 9, 0)).toThrow();
  });

  it("covers the full range over many draws (rough uniformity)", () => {
    const source = createRandomSource("seed-uniform", 0);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(source.nextInt("combat_luck", 0, 9));
    }
    expect(seen.size).toBe(10);
  });
});
