# Iteration 13 — PWA Pattern Lab

A mobile-first, installable progressive web app prototype built from the proven The Plug foundation. The product-facing shell demonstrates clear customer actions, responsive layout, install behavior, offline boundaries and an iPhone Safari installation explainer.

## Prototype journeys
- **Home:** editorial, mobile-first pattern overview with customer, operations, installation and offline entry points.
- **Customer:** `/request` and `/account` preserve the foundation customer request/account workflows.
- **Operations:** `/admin` preserves the existing protected staff workflow; access still depends on its existing server/auth controls.
- **Installation:** branded install action uses the retained browser prompt when available, with platform-specific guidance when the browser does not provide one. `/iphone-install` explains Safari Share → Add to Home Screen and links to the supplied walkthrough.
- **Offline:** `/offline` explains that cached content may be stale and private writes are not confirmed while disconnected.

## Development

```sh
npm install
npm run dev
npx tsc --noEmit
npm run lint
npm run verify:identity
npm run build
```

## Boundaries
- Firebase configuration, Firestore rules, Storage rules, and data model were intentionally left unchanged for this prototype pass.
- The app does not claim offline private writes have synchronized. Verify the exact workflows against the dedicated Iteration 13 Firebase environment before relying on persistence.
- iOS installation must be tested on a physical iPhone/iPad in Safari. Chromium `beforeinstallprompt` is not an iOS install API.
- A successful GitHub push does not confirm a Vercel deployment.

## QA checkpoint
1. Open the homepage at desktop width and at 320–390 px; confirm no horizontal overflow and all four pattern links work.
2. Use Install app in Chrome/Edge where the native prompt is available; dismiss it and confirm platform guidance is shown when no prompt is available.
3. On iPhone Safari, follow `/iphone-install`: Share → Add to Home Screen → Add; open the installed icon.
4. Test an embedded browser; confirm the blocking open-in-browser handoff is usable.
5. Visit a public page while online, then go offline and revisit; check that cached public shell behavior is honest and private routes do not expose cached private content.
6. Use customer request and staff operations journeys with configured credentials; verify saved actions only show success after the server confirms them.
7. Reconnect, refresh after an update becomes ready, and confirm the new shell is served.
