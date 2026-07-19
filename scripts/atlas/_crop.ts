import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

/** Dev helper: crop a region of a sheet and scale it up, for visual checks. */
const [file, xs, ys, ws, hs, out, zs] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(file!));
const x = Number(xs);
const y = Number(ys);
const w = Number(ws);
const h = Number(hs);
const zoom = Number(zs ?? 4);
const dst = new PNG({ width: w * zoom, height: h * zoom });
for (let dy = 0; dy < h * zoom; dy++) {
  for (let dx = 0; dx < w * zoom; dx++) {
    const sx = x + Math.floor(dx / zoom);
    const sy = y + Math.floor(dy / zoom);
    const si = (sy * png.width + sx) * 4;
    const di = (dy * dst.width + dx) * 4;
    const opaque = png.data[si + 3]! > 8;
    dst.data[di] = opaque ? png.data[si]! : 24;
    dst.data[di + 1] = opaque ? png.data[si + 1]! : 24;
    dst.data[di + 2] = opaque ? png.data[si + 2]! : 32;
    dst.data[di + 3] = 255;
  }
}
writeFileSync(out!, PNG.sync.write(dst));
