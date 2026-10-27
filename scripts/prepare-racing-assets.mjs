import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const archive = path.join(root, "game-assets/source-zips/kenney_racing-kit.zip");
const output = path.join(root, "public/game-assets/racing-kit");
const manifestPath = path.join(output, "manifest.json");

function entriesOf(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Racing Kit ZIP has no end-of-central-directory record.");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const result = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP central directory entry.");
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    result.push({ name, method, crc, compressedSize, size, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function unpack(buffer, entry) {
  const offset = entry.localOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error("Invalid local ZIP entry: " + entry.name);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error("Unsupported ZIP compression " + entry.method + " for " + entry.name);
}

function safeRelative(name) {
  const normalized = path.posix.normalize(name.replace(/^\/+/, ""));
  if (normalized.startsWith("../") || normalized === "..") throw new Error("Unsafe ZIP path: " + name);
  return normalized;
}

if (!fs.existsSync(archive)) throw new Error("Missing Kenney Racing Kit archive: " + archive);
const zip = fs.readFileSync(archive);
const entries = entriesOf(zip).filter((entry) => !entry.name.endsWith("/"));
const models = entries.filter((entry) => /\.(glb|gltf)$/i.test(entry.name));
if (!models.length) throw new Error("No GLB/glTF models found in Kenney Racing Kit. Inspect archive formats before continuing.");

const selectedDirs = new Set(models.filter((entry) => /\.gltf$/i.test(entry.name)).map((entry) => path.posix.dirname(entry.name)));
const selected = entries.filter((entry) => {
  if (/\.glb$/i.test(entry.name)) return true;
  if (/\.gltf$/i.test(entry.name)) return true;
  if (/\.(bin|png|jpe?g|webp|ktx2)$/i.test(entry.name)) return true;
  return [...selectedDirs].some((dir) => dir !== "." && (path.posix.dirname(entry.name) === dir || path.posix.dirname(entry.name).startsWith(dir + "/")));
});

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const manifest = [];
for (const entry of selected) {
  const relative = safeRelative(entry.name);
  const destination = path.join(output, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, unpack(zip, entry));
  if (/\.(glb|gltf)$/i.test(relative)) {
    manifest.push({
      name: path.posix.basename(relative, path.posix.extname(relative)),
      path: "/game-assets/racing-kit/" + relative.split("/").map(encodeURIComponent).join("/"),
      format: path.posix.extname(relative).slice(1).toLowerCase(),
    });
  }
}
manifest.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(manifestPath, JSON.stringify({ source: "Kenney Racing Kit", license: "CC0", assets: manifest }, null, 2) + "\n");
console.log("Racing Kit extraction complete: " + manifest.length + " 3D models prepared for the browser.");
console.log("Model candidates: " + manifest.filter((item) => /car|vehicle|race/i.test(item.name)).slice(0, 12).map((item) => item.name).join(", "));
