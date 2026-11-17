// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Rasterize the existing three-bar vector brand for native launcher/splash assets.
 * Uses no external asset service and keeps generation reproducible on Windows/macOS/Linux.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zlibSync } from 'fflate';
import { root, apps } from './workspace.mts';

const brand = JSON.parse(
  await readFile(resolve(root, 'packages/design-system/src/brand.json'), 'utf8'),
);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const bg = rgb(brand.background),
  ink = rgb(brand.foreground);
const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let n = 0; n < 8; n++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(name, bytes) {
  const type = Buffer.from(name),
    content = Buffer.from(bytes),
    result = Buffer.alloc(content.length + 12);
  result.writeUInt32BE(content.length, 0);
  type.copy(result, 4);
  content.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, content])) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, content.length + 8);
  return result;
}
function render(width, height, { transparent = false, splash = false } = {}) {
  const scan = Buffer.alloc(height * (width * 4 + 1));
  const scale = (splash ? Math.min(width, height) * 0.28 : Math.min(width, height)) / 100;
  const offsetX = (width - scale * 100) / 2,
    offsetY = (height - scale * 100) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sy = (y - offsetY) / scale - brand.translate[1];
      const sx = (x - offsetX) / scale - brand.translate[0] - brand.skew * sy;
      const mark = brand.bars.some(
        ([bx, by, bw, bh]) => sx >= bx && sx < bx + bw && sy >= by && sy < by + bh,
      );
      const i = y * (width * 4 + 1) + 1 + x * 4;
      const color = mark ? ink : bg;
      scan[i] = color[0];
      scan[i + 1] = color[1];
      scan[i + 2] = color[2];
      scan[i + 3] = mark || !transparent ? 255 : 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(scan, { level: 6 })),
    chunk('IEND', []),
  ]);
}
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
for (const app of apps.filter((item) => item.nativeId)) {
  const roots = [
    resolve(root, `apps/${app.folder}/android/app/src/main/res`),
    resolve(root, `apps/${app.folder}/ios/App/App/Assets.xcassets`),
  ];
  for (const dir of roots) {
    for (const path of await walk(dir)) {
      if (!path.endsWith('.png')) continue;
      const original = await readFile(path);
      const width = original.readUInt32BE(16),
        height = original.readUInt32BE(20);
      await writeFile(
        path,
        render(width, height, {
          transparent: path.includes('foreground'),
          splash: /splash/i.test(path),
        }),
      );
    }
  }
  const colorPath = resolve(
    root,
    `apps/${app.folder}/android/app/src/main/res/values/ic_launcher_background.xml`,
  );
  await writeFile(
    colorPath,
    `<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">${brand.background}</color></resources>\n`,
  );
  console.log(`Applied Elvorance brand to ${app.folder} native assets.`);
}
