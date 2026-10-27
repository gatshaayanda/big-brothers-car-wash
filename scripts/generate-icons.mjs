import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const output = path.join(process.cwd(), "public");
const palette = { background: [20, 34, 30, 255], lime: [198, 243, 107, 255], white: [245, 246, 241, 255] };

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, checksum]);
}
function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const cx = x < radius ? radius : x >= size - radius ? size - radius - 1 : x;
  const cy = y < radius ? radius : y >= size - radius ? size - radius - 1 : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius || (x >= radius && x < size - radius) || (y >= radius && y < size - radius);
}
const glyphB = ["11110","10001","10001","11110","10001","10001","11110"];
function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);
  const scale = Math.max(1, Math.round(size / 18));
  const glyphWidth = 11 * scale;
  const glyphHeight = 7 * scale;
  const left = Math.round((size - glyphWidth) / 2);
  const top = Math.round((size - glyphHeight) / 2);
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const at = (y * size + x) * 4;
    pixels.set(color, at);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, insideRoundedRect(x, y, size, radius) ? palette.background : [0,0,0,0]);
  }
  for (let letter = 0; letter < 2; letter++) {
    for (let row = 0; row < glyphB.length; row++) {
      for (let col = 0; col < glyphB[row].length; col++) {
        if (glyphB[row][col] !== "1") continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          put(left + (letter * 6 + col) * scale + dx, top + row * scale + dy, palette.lime);
        }
      }
    }
  }
  const dotRadius = Math.max(2, Math.round(size * 0.035));
  const dotX = Math.round(size * 0.76), dotY = Math.round(size * 0.24);
  for (let y = dotY - dotRadius; y <= dotY + dotRadius; y++) for (let x = dotX - dotRadius; x <= dotX + dotRadius; x++) {
    if ((x-dotX)**2 + (y-dotY)**2 <= dotRadius**2) put(x, y, palette.white);
  }
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(output, `big-brothers-icon-${size}.png`), render(size));
}
console.log("Generated Big Brothers Car Wash PWA icons (180, 192 and 512 px).");
