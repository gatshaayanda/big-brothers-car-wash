import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git","node_modules",".next","coverage"]);
const ignoredFiles = new Set(["AGENTS.md","scripts/verify-identity.mjs"]);
const textExtensions = new Set([".ts",".tsx",".js",".mjs",".css",".json",".webmanifest",".md",".yml",".yaml",".txt",".html",".svg"]);
const failures = [];
function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full)); else files.push(full);
  }
  return files;
}
for (const file of walk(root)) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  if (ignoredFiles.has(rel) || !textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = fs.readFileSync(file, "utf8");
  if (/boemo-joos-food-deals|namane-tyres\\.vercel\\.app|yusuf-clothing-line\\.vercel\\.app/i.test(content)) failures.push(rel + ": inherited project URL remains");
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
if (manifest.name !== "Iteration 13 | PWA Prototype") failures.push("manifest: wrong application name");
if (manifest.short_name !== "Iteration 13") failures.push("manifest: wrong short name");
if (manifest.theme_color !== "#155eef") failures.push("manifest: wrong theme color");
if (!manifest.icons?.some(icon => icon.src === "/iteration13-icon.svg")) failures.push("manifest: prototype icon missing");
if (!fs.existsSync(path.join(root, "public/iteration13-icon.svg"))) failures.push("prototype icon file missing");
const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
for (const expected of ["Iteration 13 | PWA Prototype", "applicationName:\"Iteration 13\"", "appleWebApp:{capable:true,title:\"Iteration 13\"}"]) if (!layout.includes(expected)) failures.push("layout: missing " + expected);
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
if (!/iteration13-shell-v\\d+/.test(sw)) failures.push("service worker: missing isolated cache namespace");
if (!sw.includes("/iteration13-icon.svg")) failures.push("service worker: prototype icon missing from app shell");
if (failures.length) {
  console.error("IDENTITY VERIFICATION FAILED");
  failures.forEach(failure => console.error(" - " + failure));
  process.exit(1);
}
console.log("IDENTITY VERIFIED — Iteration 13 app metadata and service-worker cache are isolated.");
