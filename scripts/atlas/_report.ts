import { readSheet, detectSprites, bands, groups } from "./detect";

/** Dev helper: list the detected sprite groups of a sheet, band by band. */
const file = process.argv[2]!;
const gap = Number(process.argv[3] ?? 1);
const maxSize = Number(process.argv[4] ?? 40);
const sheet = readSheet(file);
const boxes = detectSprites(sheet, gap).filter(
  (b) => b.w <= maxSize && b.h <= maxSize && b.w > 3 && b.h > 3,
);
console.log(`${file}  ${sheet.width}x${sheet.height}  boxes=${boxes.length}`);
for (const band of bands(boxes)) {
  for (const group of groups(band)) {
    console.log(
      `y=${String(group[0]!.y).padStart(4)} n=${group.length} :`,
      group.map((b) => `${b.x},${b.y} ${b.w}x${b.h}`).join("  "),
    );
  }
}
