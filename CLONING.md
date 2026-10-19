# Cloning Iteration 13 safely

Use this guide when creating a new project from Iteration 13. For an existing project, inspect and improve the existing repository instead of recloning it.

## 1. Establish the source and target
1. Confirm the canonical source is `gatshaayanda/iteration13`, record the source commit and inspect its current `AGENTS.md`, package scripts, route tree, and recent implementation.
2. Confirm the new repository name, product brief, intended Firebase project (if any), domain, brand, and media. Do not invent unknown business details.
3. Clone only after reading this file and the current source implementation. Never reuse another business's Firebase project, secrets, private data, service-worker configuration or deployment target.

## 2. Preserve installation before changing identity
Before touching icons or PWA metadata, inspect these exact files and assets in the source and target:
- `src/app/layout.tsx` — metadata, manifest declaration, early `beforeinstallprompt` capture and embedded-browser detection.
- `src/app/pwa-register.tsx` — retained prompt, branded install click, iOS/Android fallback guidance, embedded-browser handoff, service-worker registration and update behavior.
- `src/app/manifest.ts` and `public/manifest.webmanifest` — inspect both and verify which one is actually served; do not assume one overrides the other.
- `public/iteration13-icon.svg`, `public/iphone-install.svg`, `public/sw.js`, `src/app/iphone-install/page.tsx`, and `scripts/verify-identity.mjs`.
- `package.json` and the actual build output.

The installation baseline is a working feature. Do not rewrite it while performing a branding reset.

## 3. Research current icon and install requirements
Use current primary documentation and inspect the actual rendered/served files before making a change:
- MDN Web App Manifest: https://developer.mozilla.org/en-US/docs/Web/Manifest
- web.dev PWA installation: https://web.dev/learn/pwa/installation/
- Chrome installability guidance: https://developer.chrome.com/docs/capabilities/pwa-install
- Apple iPhone/iPad home-screen web apps: https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios

Check current support for SVG and raster manifest icons rather than assuming all browsers behave identically. Prefer valid, purpose-built 192×192 and 512×512 PNG icons for broad compatibility when the project can produce them; an SVG icon may be retained as an additional scalable icon. Verify each asset's actual dimensions, file type and path. Do not point a PNG declaration at an SVG or list dimensions the asset does not have.

## 4. Reset identity as a controlled change
Update identity consistently across:
- app name, short name, description, metadata, canonical/base URL and social metadata;
- manifest names, start URL, scope, theme/background colors and icon declarations;
- favicon, install icons, Apple web-app title/metadata and social preview media;
- visible copy, page titles, alt text, example links, and iPhone installation guidance;
- service-worker cache names and any app-specific localStorage/session keys;
- environment examples, scripts, docs, tests and identity-verification assertions.

Do not replace install code just to change an icon. Update icon assets and their references as a separate change from install mechanics. Keep the old known-good behavior until the new identity has passed verification.

## 5. Verify before promoting the clone
1. Run `npm run verify:identity`, lint and build.
2. Inspect the built/served manifest URL and parse its actual JSON. Confirm all declared icons resolve with correct content types and dimensions.
3. Confirm the page's install action still retains and invokes the browser's real `beforeinstallprompt` event directly from a user click when supported.
4. Confirm the iPhone guide, referenced illustration/video, embedded-browser handoff, service-worker registration, cache namespace, update/refresh path and offline fallback still work.
5. Test a clean install in desktop Chrome/Android Chrome and iPhone Safari when physical devices are available. A build alone is not proof of installation or offline behavior.
6. Search for leftover source identities, project IDs, hostnames, cache names, icon paths and copy. Do not declare the reset complete while any unintended inherited identity remains.
7. Push the verified changes and report commit, checks, deployment status and remaining device QA separately.

## 6. Keep scope honest
Iteration 13's service-order page is a local demo. Its localStorage requests, admin edits and analytics are not a shared backend. For a real project, decide its data model and authorization boundary from that project's brief; never present the demo admin as secure real-world administration.


## Adapt the customer account to the target project

Treat the account as a reusable capability set, not fixed Iteration 13 branding. Inspect `src/app/AccountWorkspace.tsx`, the customer order/request data shape, admin request workflow, UploadThing/file endpoints, local persistence and current authentication before editing.

Preserve relevant capabilities and fit them to the product:
- Customer request/order history, status explanations and obvious next actions.
- A request-specific conversation where customer messages and staff/admin replies are visible to the correct sides.
- Attachment sharing with explicit file-type, size, connection and progress/error feedback.
- Project-appropriate gamified progress or a small theme-specific interaction; do not keep the garden/game theme when it does not fit.
- A lightweight journal, saved preferences, offers, reminders or other account extras only when they make sense for the project.
- Offline access to cached app shell and honestly supported local drafts/state, with clear separation from server synchronization.

For the Iteration 13 prototype, the customer and admin share localStorage on one browser profile. Messages and status updates work in that local demo thread but are not sent to a real admin, email address or other device. Text/local changes can be tested offline after the app shell is cached. UploadThing attachments require internet; the current endpoint accepts images up to 4 MB, PDFs up to 4 MB and videos up to 16 MB. Offline attachments are not queued.

For production adaptations, implement the target project's authenticated persistence and record ownership checks; authorize admin replies on the server/security-rule boundary; choose whether uploads are private/public and apply matching access controls; and implement actual notification delivery only if configured. Do not label localStorage as a customer account, secure journal, remote communication, or cloud backup. Keep account creation proportionate and preserve anonymous identity when linking credentials if that is part of the existing app.

Before QA handoff, verify: empty account, matching/non-matching email, multiple requests, status changes, customer message → admin reply → customer sees reply, upload success/failure and size limits, offline text/state persistence, offline upload messaging, mobile/keyboard usability, and that the account's game/copy/assets match the target project rather than inherited demo content.
