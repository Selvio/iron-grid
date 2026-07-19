import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/** Dev helper: dump the dominant quantized colors of one tile. */
const [file, pitchArg, oxArg, oyArg] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(file!));
const pitch = Number(pitchArg);
const ox = Number(oxArg);
const oy = Number(oyArg);

for (const spec of process.argv.slice(6)) {
  const [c, r] = spec.split(",").map(Number);
  const counts = new Map<string, number>();
  const x0 = ox + c! * pitch;
  const y0 = oy + r! * pitch;
  for (let y = y0 + 4; y < y0 + pitch - 4; y += 2) {
    for (let x = x0 + 4; x < x0 + pitch - 4; x += 2) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const i = (y * png.width + x) * 4;
      const key = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!]
        .map((v) => Math.round(v / 32) * 32)
        .join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => `${k}=${Math.round((n / total) * 100)}%`);
  console.log(`tile ${spec}: ${top.join("  ")}`);
}
