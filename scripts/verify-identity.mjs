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
  if (/boemo-joos-food-deals|namane-tyres\.vercel\.app|yusuf-clothing-line\.vercel\.app/i.test(content)) failures.push(rel + ": inherited project URL remains");
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
if (manifest.name !== "Iteration 13 | Service Studio") failures.push("manifest: wrong application name");
if (manifest.short_name !== "Iteration 13") failures.push("manifest: wrong short name");
if (manifest.theme_color !== "#155eef") failures.push("manifest: wrong theme color");
if (!manifest.icons?.some(icon => icon.src === "/iteration13-icon.svg" || icon.src === "/iteration13-icon-192.svg")) failures.push("manifest: prototype icon missing");
for (const iconPath of ["/iteration13-icon.svg", "/iteration13-icon-192.svg", "/iteration13-icon-512.svg", "/iteration13-icon-192.png", "/iteration13-icon-512.png", "/iteration13-icon-180.png"]) {
  if (!manifest.icons?.some(icon => icon.src === iconPath)) failures.push("manifest: icon missing " + iconPath);
  if (!fs.existsSync(path.join(root, "public", iconPath.slice(1)))) failures.push("manifest icon asset missing " + iconPath);
}
const appManifest = fs.readFileSync(path.join(root, "src/app/manifest.ts"), "utf8");
if (!appManifest.includes('name: "Iteration 13 | Service Studio"')) failures.push("app manifest: wrong application name");
if (appManifest.includes("The Plug") || appManifest.includes("plug-icon")) failures.push("app manifest: inherited The Plug identity remains");
for (const iconPath of ["/iteration13-icon-192.png", "/iteration13-icon-512.png"]) if (!appManifest.includes(iconPath)) failures.push("app manifest: missing " + iconPath);
if (!fs.existsSync(path.join(root, "public/iteration13-icon.svg"))) failures.push("prototype icon file missing");
const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
for (const expected of ["Iteration 13 | PWA Prototype", "applicationName:\"Iteration 13\""]) if (!layout.includes(expected)) failures.push("layout: missing " + expected);
// Validate Apple install metadata semantically; whitespace and additional metadata fields are harmless.
if (!/appleWebApp\s*:\s*\{[^}]*\bcapable\s*:\s*true\b[^}]*\btitle\s*:\s*["']Iteration 13["']/s.test(layout)) failures.push('layout: missing appleWebApp capable=true and title="Iteration 13"');
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
if (!/iteration13-shell-v\d+/.test(sw)) failures.push("service worker: missing isolated cache namespace");
if (!sw.includes("/iteration13-icon.svg")) failures.push("service worker: prototype icon missing from app shell");
if (!sw.includes("/iphone-install") || !sw.includes("/iphone-install.svg")) failures.push("service worker: iPhone installation guide is not cached for offline use");
const installGuidePath = path.join(root, "src/app/iphone-install/page.tsx");
if (!fs.existsSync(installGuidePath)) failures.push("iPhone installation guide route missing");
else if (!fs.readFileSync(installGuidePath, "utf8").includes("https://youtu.be/et2_1AcBYlg")) failures.push("iPhone installation guide: walkthrough link missing");
if (!fs.existsSync(path.join(root, "public/iphone-install.svg"))) failures.push("iPhone installation illustration missing");
if (failures.length) {
  console.error("IDENTITY VERIFICATION FAILED");
  failures.forEach(failure => console.error(" - " + failure));
  process.exit(1);
}
console.log("IDENTITY VERIFIED — Iteration 13 app metadata and service-worker cache are isolated.");
