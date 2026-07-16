/**
 * The concrete deterministic `RandomSource` — a counter-based, streamed PRNG
 * (M7-T1).
 *
 * `random.ts` defines the `RandomSource` contract the engine draws from but ships
 * no implementation. This is it: a **stateless-per-draw**, replay-safe generator
 * where each draw's value is a hash of `(seed, stream, index)` — it never depends
 * on prior draws' values, so replay from the same `(seed, startIndex)` reproduces
 * every draw bit-for-bit, and the named streams (`combat_luck`, …) are decorrelated
 * because the stream name is mixed into the hash
 * (`randomness.non_combat_randomness.use_separate_named_streams`). One `nextInt`
 * call consumes exactly one index, so `drawCount` is what the action pipeline adds
 * to `MatchMeta.randomSequenceIndex` on a committed action (a failed action
 * consumes none — `action_processing.failure`).
 *
 * Pure: no `Math.random`, no wall clock, no I/O (`engine_contract.purity`). The
 * algorithm is stable and versioned by code — changing it would change replay
 * outcomes for existing matches, so it must be treated like a data-version change.
 *
 * @see docs/02-data/rules.yaml → randomness
 * @see docs/03-architecture/backend.md §5
 * @see packages/game-engine/src/random.ts
 * @see docs/04-development/milestones/m7-actions.md (M7-T1)
 */

import type { RandomSource, RandomStream } from "./random";

/** A `RandomSource` that reports how many draws it has taken. */
export interface SeededRandomSource extends RandomSource {
  /**
   * Draws taken since the start index — the amount to advance
   * `MatchMeta.randomSequenceIndex` by when the action commits.
   */
  readonly drawCount: number;
}

/** FNV-1a 32-bit hash of a string, returned as an unsigned 32-bit integer. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** murmur3 32-bit finalizer — an avalanche mixer for a 32-bit integer. */
function mix32(value: number): number {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Precomputed per-stream salts so streams never share a value sequence. */
const STREAM_SALT: Record<RandomStream, number> = {
  combat_luck: hashString("combat_luck"),
  combat_counter_luck: hashString("combat_counter_luck"),
  first_player: hashString("first_player"),
  commander_first_picker: hashString("commander_first_picker"),
};

/** A uint32 drawn from the counter `(seedHash, stream salt, index)`. */
function draw32(seedHash: number, streamSalt: number, index: number): number {
  // Combine the three coordinates, then avalanche. `index + 1` avoids a zero
  // collapse at index 0; the golden-ratio and murmur constants decorrelate the
  // stream and index axes.
  const combined =
    (seedHash ^
      Math.imul(streamSalt, 0x9e3779b1) ^
      Math.imul((index + 1) | 0, 0x85ebca6b)) >>>
    0;
  return mix32(combined);
}

/**
 * Builds a deterministic `RandomSource` seeded by `seed`, beginning at
 * `startIndex` (a match's persisted `randomSequenceIndex`).
 *
 * @throws if `nextInt` is called with `maxInclusive < minInclusive`.
 */
export function createRandomSource(
  seed: string,
  startIndex: number,
): SeededRandomSource {
  const seedHash = hashString(seed);
  let index = startIndex;

  return {
    nextInt(
      stream: RandomStream,
      minInclusive: number,
      maxInclusive: number,
    ): number {
      const range = maxInclusive - minInclusive + 1;
      if (range <= 0) {
        throw new Error(
          `createRandomSource: invalid range [${minInclusive}, ${maxInclusive}]`,
        );
      }
      const value = draw32(seedHash, STREAM_SALT[stream], index);
      index += 1;
      // One index per draw; the tiny modulo bias over a 2^32 space is negligible
      // for gameplay ranges (e.g. luck 0–9). Rejection sampling is avoided so a
      // draw always consumes exactly one index (keeps replay/index accounting exact).
      return minInclusive + (value % range);
    },
    get drawCount(): number {
      return index - startIndex;
    },
  };
}
