# Iteration 13 — Foundation blueprint

This file is the fast handoff for a new ChatGPT/Codex conversation. Read it with `AGENTS.md` before editing. GitHub `main` is the source of truth; inspect the actual latest commit rather than trusting an old chat summary.

## What this repository is

Iteration 13 is a **candidate reusable, mobile-first PWA foundation** demonstrated through a local-only service-order studio. It is not yet a production business app, secure admin, cloud-backed CRM, or universal template. Its primary purpose is to prove the customer journey, admin feedback, installation and offline patterns before they are promoted into future apps.

## Start here (fast map)

| Area | Source of truth | What to preserve / know |
| --- | --- | --- |
| Rules and protected behavior | `AGENTS.md` | Read first. Explicitly protects install capture, prompt, embedded-browser handoff, iPhone guide and offline behavior. |
| Customer + local admin demo | `src/app/page.tsx` | Service cards, order request form, local account view, admin CRUD, announcements and status changes. Several views live in one client component intentionally for the prototype. |
| Demo data model | Same file; key `iteration13:service-demo:v1` | `services`, `orders`, `announcement`, `views` stored in this browser's localStorage. This is not cross-device or server persistence. |
| Global styling | `src/app/globals.css` | Large inherited stylesheet plus the Service Studio styles. Append focused changes; avoid replacing the file wholesale. |
| PWA boundary | `src/app/layout.tsx`, `src/app/pwa-register.tsx` | Early `beforeinstallprompt` capture, retained one-shot event, native prompt on user click, install help, embedded-browser gate, offline/reconnect banners and update action. Protected behavior. |
| Service worker | `public/sw.js` | Versioned `iteration13-shell-*` cache, app-shell precache, same-origin asset cache, offline navigation fallback, update message. Optional push imports must not block its offline handlers. |
| Manifest/identity | `src/app/manifest.ts`, `public/manifest.webmanifest`, `src/app/layout.tsx`, `public/iteration13-icon-*` | Two manifest representations exist. Inspect the manifest actually served by the build before changing icons or metadata. |
| iPhone installation | `src/app/iphone-install/page.tsx`, `public/iphone-install.svg` | Keep Safari → Share → Add to Home Screen guidance and the existing walkthrough link. |
| Offline guidance | `src/app/offline/page.tsx` | Explains local-only behavior; server-dependent/Firebase routes still need a connection. |
| PWA pattern lab | `src/app/patterns/page.tsx` | Interactive reference page for the installation entry point and PWA behavior. |
| Identity/build checks | `scripts/verify-identity.mjs`, `package.json` | Run `npm run verify:identity`, `npm run lint`, `npx tsc --noEmit`, `npm run build` where the environment permits. Build runs identity verification first. |

## Current demo contract

- Sample services: Website P100, App P200, Monthly support P50, Phaser games P500.
- Customer chooses a service, enters name/email, picks a requested date today or later, optionally adds a brief, then sees the request in My account.
- The requested date is not a confirmed delivery promise; no payment is taken.
- Admin demo supports service add/edit/hide/show/delete, announcement publish/clear, request-status changes, local stats and reset.
- The customer and admin views share the same browser profile's localStorage. Never claim the data is synced, shared, submitted to a real business or safe for real customer records.
- External media can fail offline; cards must retain a useful local visual fallback.
- `/request` is retained only as a compatibility redirect to the service-order journey; it is not the old Plug sourcing form.
- This prototype's service-order data flow intentionally does not use Firebase. Firebase config/rules/data were not changed in this improvement pass.

## Protected invariants — do not casually rewrite

1. Do not remove or change the early install capture in `layout.tsx`, the `iteration13-open-install` event, retained one-shot event, or the explicit click that calls the native browser prompt in `pwa-register.tsx`.
2. Do not fake an install prompt or turn the branded install CTA into a no-op. Keep the embedded-browser blocking handoff and iPhone Safari guide.
3. Do not change manifest/icon paths without checking both manifest sources and the final served manifest/assets.
4. Keep service-worker cache names scoped to Iteration 13. Bump the shell cache version for a shell/routing policy change; keep offline fallback, update detection and refresh action.
5. Remote Firebase Messaging is optional to the demo's shell. Its import failure must not prevent service-worker offline handlers from registering. Do not change Firebase project settings/rules/data as part of a UI task.
6. Do not claim local writes reached a server. A local change should only be shown as saved if localStorage accepted the write.
7. Keep mobile-first layout, visible focus, readable touch targets, status announcements and reduced-motion support.

## How to extend it safely

### New client project

- First decide whether the task is a new app cloned from this foundation or work on an existing app. Do not overwrite an existing implementation just to adopt this repo.
- Create an identity reset checklist: app name, visible copy, domain/base URL, metadata/Open Graph, manifest, PNG/SVG icons, Apple metadata, cache namespaces, routes, media, install guide and identity-verification checks.
- Replace demo services, prices, copy and media with project-specific requirements. Do not ship sample prices or local-only account semantics as real functionality.
- Decide the persistence boundary before building: local prototype, Firebase-backed records, or another backend. If server-backed, implement ownership/authorization at the rules/server boundary; never just make a database public.
- Keep the proven install flow separate from icon artwork or brand changes.
- Verify customer journey first, then staff/admin workflows, mobile widths, keyboard/accessibility, empty/error/success states, offline state and install behavior.

### Improve this foundation

- Make focused changes and preserve the last known-good `main` commit. Do not replace all of `globals.css` or rewrite the install system for a toast, icon, or copy change.
- Run source-level checks, then the configured identity/lint/type/build commands if possible. State exactly what ran.
- Separate GitHub push, CI/build status, Vercel deployment status and real device/offline testing. A push alone proves none of the latter.
- For offline QA: load online first, let the service worker install/update, reload once, then enable airplane mode and test customer request → My account → admin status change → account reflects status → refresh. Verify a new visit and a refresh separately. Confirm external media fallback.
- For installation QA, test Android Chrome's actual native prompt when available and physical iPhone Safari's Share → Add to Home Screen flow. Never treat an emulator or code inspection as device proof.

## Legacy boundaries to review deliberately

The repo contains inherited Firebase/PWA integration code beyond the local-only service demo, including background messaging and pending-notification retry hooks. They were not removed here because the product owner asked to leave Firebase alone and protect installation. Before using this repo for a real project, explicitly decide whether to retain, reconfigure or remove those integrations; do not silently inherit The Plug's project-specific notification behavior.

## Chat widget direction

The current Iteration 13 service demo does not include a chat widget. The Sparkle Legacy reference and UX findings are documented in [CHAT-WIDGET-RESEARCH.md](./CHAT-WIDGET-RESEARCH.md). Treat that file as a design brief, not a mandate to copy the insurance widget unchanged.
