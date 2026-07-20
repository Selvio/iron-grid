import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const ref = PNG.sync.read(readFileSync(process.env.REF!));
const mine = PNG.sync.read(readFileSync(process.env.MINE!));
const Z = 2,
  GAP = 8;
const w = ref.width * Z,
  h = ref.height * Z;
const dst = new PNG({ width: w * 2 + GAP, height: h });
const put = (src: PNG, zoom: number, offX: number) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / zoom),
        sy = Math.floor(y / zoom);
      if (sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4,
        di = (y * dst.width + x + offX) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = 255;
    }
};
put(ref, Z, 0);
put(mine, 1, w + GAP);
writeFileSync(process.env.OUT!, PNG.sync.write(dst));
console.log(`${dst.width}x${dst.height} -> ${process.env.OUT}`);
