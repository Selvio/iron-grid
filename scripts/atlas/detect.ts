import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/**
 * Sprite detection for the atlas build (`scripts/build-atlas.ts`).
 *
 * The Advance-Wars sheets are rips with no grid: every unit is a differently
 * sized blob at an arbitrary offset. Rather than hand-measure ~80 rectangles,
 * this scans the alpha channel, labels connected regions and merges the pieces
 * that belong to one sprite (a soldier and his rifle, a tank and its muzzle
 * smoke), producing candidate boxes the curated seed table then names.
 *
 * Pure module (fs read aside) so the geometry stays testable.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  readonly width: number;
  readonly height: number;
  /** Row-major opacity mask: true when the pixel is not fully transparent. */
  readonly opaque: Uint8Array;
}

/** Reads a PNG into an opacity mask. */
export function readSheet(file: string): Sheet {
  const png = PNG.sync.read(readFileSync(file));
  const opaque = new Uint8Array(png.width * png.height);
  for (let i = 0; i < opaque.length; i++) {
    opaque[i] = png.data[i * 4 + 3]! > 8 ? 1 : 0;
  }
  return { width: png.width, height: png.height, opaque };
}

/** Connected opaque regions (8-connectivity), as bounding boxes. */
export function components(sheet: Sheet): Box[] {
  const { width, height, opaque } = sheet;
  const seen = new Uint8Array(width * height);
  const boxes: Box[] = [];
  const stack: number[] = [];

  for (let start = 0; start < opaque.length; start++) {
    if (opaque[start] === 0 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.push(start);
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (opaque[next] === 0 || seen[next] === 1) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return boxes;
}

const overlaps = (a: Box, b: Box, gap: number): boolean =>
  a.x - gap <= b.x + b.w &&
  b.x - gap <= a.x + a.w &&
  a.y - gap <= b.y + b.h &&
  b.y - gap <= a.y + a.h;

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/**
 * Merges boxes that sit within `gap` pixels of each other — the pieces of one
 * sprite (detached weapon, rotor, exhaust puff) become a single frame.
 */
export function mergeNearby(boxes: readonly Box[], gap = 2): Box[] {
  const merged = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (!overlaps(merged[i]!, merged[j]!, gap)) continue;
        merged[i] = union(merged[i]!, merged[j]!);
        merged.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

/** Detected sprite boxes, sorted top-to-bottom then left-to-right. */
export function detectSprites(sheet: Sheet, gap = 2): Box[] {
  const boxes = mergeNearby(components(sheet), gap);
  return boxes.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Boxes grouped into rows: any two boxes whose vertical spans overlap. */
export function bands(boxes: readonly Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const box of boxes) {
    const row = rows.find((r) =>
      r.some((b) => box.y < b.y + b.h && b.y < box.y + box.h),
    );
    if (row === undefined) rows.push([box]);
    else row.push(box);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => a[0]!.y - b[0]!.y);
}

/**
 * Splits a band into animation groups: the sheets space frames of one clip a few
 * pixels apart and leave a wider gutter between clips, so a horizontal gap wider
 * than `gutter` starts a new group (idle | walk-side | …).
 */
export function groups(band: readonly Box[], gutter = 10): Box[][] {
  const out: Box[][] = [];
  let current: Box[] = [];
  let previousRight = -Infinity;
  for (const box of band) {
    if (current.length > 0 && box.x - previousRight > gutter) {
      out.push(current);
      current = [];
    }
    current.push(box);
    previousRight = box.x + box.w;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** The detected box containing `(x, y)`, or the nearest one within 6 px. */
export function boxAt(boxes: readonly Box[], x: number, y: number): Box | null {
  const hit = boxes.find(
    (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
  );
  if (hit !== undefined) return hit;
  let best: Box | null = null;
  let bestDistance = Infinity;
  for (const b of boxes) {
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = b;
    }
  }
  return bestDistance <= 6 ? best : null;
}
