// Builds src/app/favicon.ico from public/icon.svg, for browsers that ask for
// /favicon.ico and ignore the SVG icon. Run it after build-logo.mjs:
//
//   node docs/design/brand/build-favicon.mjs
//
// The .ico holds three PNG images (16, 32 and 48 px). It needs `sharp`, which
// the repository already uses for photographs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const svg = readFileSync(resolve(root, "public/icon.svg"));
const sizes = [16, 32, 48];

const images = await Promise.all(
  sizes.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()),
);

// ICO layout: a 6-byte header, one 16-byte entry per image, then the images.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = header.length + 16 * images.length;
const entries = images.map((image, index) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(sizes[index], 0); // width
  entry.writeUInt8(sizes[index], 1); // height
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});

const out = resolve(root, "src/app/favicon.ico");
writeFileSync(out, Buffer.concat([header, ...entries, ...images]));
console.log("wrote", out);
