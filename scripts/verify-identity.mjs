import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }

const appManifest = read("src/app/manifest.ts");
if (!appManifest.includes("Big Brothers Car Wash") || !appManifest.includes('short_name: "Big Bros"') || appManifest.includes("Iteration 13") || appManifest.includes("Vula's Car Wash")) {
  failures.push("App manifest identity mismatch.");
}
for (const icon of ["big-brothers-icon-180.png", "big-brothers-icon-192.png", "big-brothers-icon-512.png"]) {
  if (!appManifest.includes("/" + icon)) failures.push("Manifest is missing " + icon + ".");
}
if (!exists("public/big-brothers-icon.svg") || !exists("scripts/generate-icons.mjs")) failures.push("Branded icon source or PNG generator is missing.");
if (!appManifest.includes('form_factor: "wide"') || !appManifest.includes("/pwa-screenshot-wide.svg")) failures.push("Wide PWA screenshot is missing from the manifest.");
if (!appManifest.includes("/pwa-screenshot-mobile.svg")) failures.push("Mobile PWA screenshot is missing from the manifest.");
for (const screenshot of ["pwa-screenshot-wide.svg", "pwa-screenshot-mobile.svg"]) {
  if (!exists("public/" + screenshot)) failures.push("PWA screenshot asset missing: " + screenshot);
}

const layout = read("src/app/layout.tsx");
for (const text of ["Big Brothers Car Wash", "big-brothers.css", "PwaRegister", 'manifest: "/manifest.webmanifest"']) {
  if (!layout.includes(text)) failures.push("Layout is missing " + text + ".");
}
const pwaRegister = read("src/app/pwa-register.tsx");
for (const text of ["beforeinstallprompt", "prompt.prompt()", "af-install-card", "af-install-close", "af-install-action"]) {
  if (!pwaRegister.includes(text)) failures.push("Africhiko install lifecycle is missing " + text + ".");
}
const pwaCss = read("src/app/pwa.css");
for (const text of [".af-install-card", ".af-install-close", ".af-install-action"]) {
  if (!pwaCss.includes(text)) failures.push("Africhiko install-card styling is missing " + text + ".");
}
const sw = read("public/sw.js");
if (!sw.includes("big-brothers-shell-v4") || !sw.includes("big-brothers-game-v4") || !sw.includes("/offline")) {
  failures.push("Service-worker cache isolation or offline fallback is missing.");
}
if (!sw.includes("const cacheCopy = response.clone();")) failures.push("Manifest response-cloning protection is missing.");
if (sw.includes("vula-shell-") || sw.includes("iteration13-shell-") || sw.includes("theplug-shell-")) {
  failures.push("Service worker still contains a legacy cache namespace.");
}

const home = read("src/app/page.tsx");
for (const text of ["Big Brothers Car Wash", "Join the walk-in queue", 'useState<"book" | "queue" | "fleet">("queue")', "bookings", "queueEntries", "fleetRequests", "syncOfflineRequests"]) {
  if (!home.includes(text)) failures.push("Customer app is missing " + text + ".");
}
if (!home.includes('const pendingKey = "big-brothers-car-wash:offline-requests:v1";')) failures.push("Offline request storage is not isolated to Big Brothers.");
const data = read("src/lib/firebase/big-brothers-data.ts");
for (const text of ["subscribeBookings", "subscribeQueue", "subscribeFleet", "subscribeServices", "subscribeSettings"]) {
  if (!data.includes(text)) failures.push("Firebase data layer is missing " + text + ".");
}
const rules = read("firestore.rules");
for (const text of ["match /bookings/", "match /queueEntries/", "match /fleetRequests/", "function isAdmin()"]) {
  if (!rules.includes(text)) failures.push("Firestore security rules are missing " + text + ".");
}
for (const file of ["src/app/page.tsx", "src/app/layout.tsx", "src/app/manifest.ts", "src/app/iphone-install/page.tsx", "src/app/offline/page.tsx", "src/app/admin/big-brothers-dashboard.tsx"]) {
  const source = read(file);
  for (const identity of ["Vula's Car Wash", "Vula's team", "Vula's system", "Iteration 13 | Service Studio", "The Plug"]) {
    if (source.includes(identity)) failures.push(file + " contains inherited identity text: " + identity);
  }
}
if (exists("public/manifest.webmanifest")) failures.push("Remove the stale public manifest so the Next.js manifest route is authoritative.");

if (failures.length) {
  console.error("BIG BROTHERS IDENTITY / FOUNDATION VERIFICATION FAILED");
  failures.forEach(item => console.error(" - " + item));
  process.exit(1);
}
console.log("BIG BROTHERS FOUNDATION VERIFIED — identity, manifest, generated icons, Africhiko install card, isolated PWA caches, walk-in intake and Firestore rules are present.");
