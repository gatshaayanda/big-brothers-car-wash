# Iteration 13 — Service Studio prototype

**Fast handoff for future chats:** read [`AGENTS.md`](./AGENTS.md), then [`FOUNDATION-BLUEPRINT.md`](./FOUNDATION-BLUEPRINT.md). The Sparkle Legacy chat-widget reference and evidence-led proposal live in [`CHAT-WIDGET-RESEARCH.md`](./CHAT-WIDGET-RESEARCH.md). These files explain what to preserve, where to edit, what is demo-only, and what needs deliberate project-specific replacement.

A reusable, mobile-first PWA foundation candidate. The homepage demonstrates a complete service-order journey using browser-local demo data. Firebase configuration, rules and data were intentionally left unchanged.

## Customer demo

1. Open the homepage and browse the four example services:
   - Website — P100
   - App — P200
   - Monthly support — P50
   - Phaser games — P500
2. Select **Request this service**, enter a name and email, choose a requested timeline date (today or later), and optionally describe the project.
3. Submit the request. It should take you to **My account**, where the request, requested date, starting price and status are shown.
4. Return to Services to submit another request or filter account requests by the same email.

The date is a requested timeline, not a confirmed delivery promise. No payment is taken.

## Local admin demo

Use **Admin demo** at the bottom of the page. From the admin view you can:

- Add, edit, hide/show and delete services.
- Change prices, descriptions, image/video URLs and media type.
- Publish or clear a storefront announcement.
- Review incoming requests and change their status.
- See summary counts for requests, statuses, services, customer emails and demo visits.
- Reset the local sample data for another walkthrough.

This is a prototype control surface, not a secure admin boundary. Do not enter real customer data.

## Persistence and offline QA

- Orders, service edits, announcements and statuses are stored in this browser's `localStorage`; customer and admin views share the same local data on the same browser profile.
- Data is not shared with other devices, sent to a business, or synchronized to Firebase.
- Visit the homepage while online first so the service worker can cache the app shell. Then switch the device/browser offline and reload the homepage. Confirm the app shell opens, submit a sample request, and use the bottom **Admin demo** entry to change its status. Return to **My account** and confirm the status is reflected.
- External preview images/videos may need a connection; if an asset is unavailable, the service card should fall back to its local visual placeholder. Offline success means local demo state persists on this device, not that external media is downloaded.
- If local storage is blocked or full, the app should show a notice; do not interpret a local save notice as server synchronization.

## Installation — protected behavior

The existing installation mechanics are intentionally preserved:

- The browser's retained `beforeinstallprompt` event is invoked from the user's explicit branded install action when available.
- When a native prompt is unavailable, platform-specific guidance is shown instead of a dead button or fake native prompt.
- Embedded browsers receive a blocking open-in-browser handoff.
- `/iphone-install` explains Safari Share → Add to Home Screen and includes the walkthrough link.
- Service-worker caches use an Iteration 13 namespace and provide an update/refresh action.

The duplicate header install CTA has been removed; the persistent branded install action remains the single install entry point. Do not alter install mechanics when changing icon artwork.

## Interaction feedback

Action buttons provide visible press/focus feedback. Successful local changes and validation/storage failures use a dismissible, screen-reader-announced toast. A success message is shown only after the browser accepts the localStorage write; it does not imply server synchronization.

## Development and verification

```sh
npm install
npx tsc --noEmit
npm run verify:identity
npm run lint
npm run build
```

After changing icons, inspect both `public/manifest.webmanifest` and `src/app/manifest.ts`, verify all referenced assets and the manifest actually served by the built app, and test Chrome/Android plus physical iPhone Safari. Firebase configuration and rules are outside this prototype's scope.


## Guided customer and admin flow

The floating **Need a hand?** guide is optional and scripted. Customers can choose a service, continue into the existing request form or open My account. In Admin demo, it links directly to service management, announcements, incoming requests and the storefront. It does not send chat messages to a server or use an AI model. Its small invitation can be dismissed for the current tab session.

Before cloning/adapting the guide, read [CHAT-WIDGET-RESEARCH.md](./CHAT-WIDGET-RESEARCH.md) and [FOUNDATION-BLUEPRINT.md](./FOUNDATION-BLUEPRINT.md). Keep the main customer journey obvious when the guide is closed.


## Customer account workspace

**My account** now demonstrates more than an empty request list:
- Filter and review request history, requested timeline, starting price and current status.
- Open a conversation attached to a specific request, send a message and share an image, video or PDF attachment while online.
- See admin/studio replies in the same thread in the Admin demo on this same browser.
- Use a small Studio Garden interaction and save a project note for later in this browser.
- Continue reading saved local state and sending text messages offline after the app shell has been cached. File uploads require internet and are not queued.

**Important limitation:** this remains a local prototype. Requests, messages, replies, statuses, garden progress and notes use this browser's storage. They are not sent to a real admin, emailed, or synchronized to another device. UploadThing files are uploaded remotely while online (images up to 4 MB, PDFs up to 4 MB, videos up to 16 MB), but their message metadata is saved in this browser's local thread. Do not use real customer data.

### Reusing the account in another project

Read the customer account adaptation contract in `AGENTS.md` and the account section in `CLONING.md`. Keep the useful capabilities, but replace the theme/game, wording, account extras, status language, file policy and actions with those that fit the actual project. Inspect its authentication, persistence, admin workflow and security rules. A production account requires verified per-customer data access and staff authorization; the demo's localStorage thread is not a real support inbox.
