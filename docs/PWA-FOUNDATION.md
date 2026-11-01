# Reusable PWA Foundation Contract

This document is the portable baseline for every new PWA created by cloning BOEMO, The Plug, PurePress, or another existing project. Read it when starting a new repository or continuing clone work in a fresh ChatGPT/Codex session.

## Core rule

Preserve proven PWA behavior deliberately; do not blindly copy the source app's identity, Firebase resources, business rules, routes, or hidden configuration. The chosen source may change between projects. The process does not.

## Start with reality

1. Read `AGENTS.md` in both the target and foundation repositories.
2. Inspect the actual code, recent commits, Git remote/branch, deployment project and exact production source SHA before editing.
3. Trace the customer journey: fresh visit, install CTA, native prompt or platform instructions, dismissal, installed/standalone launch, embedded browser (if applicable), offline mode, route navigation, authentication, and return path.
4. Locate the real implementation for manifest, icons, service worker, cache strategy, root PWA/install controller, offline route, auth and notifications. Never assume filenames or that an old fix is present.
5. Write down what behavior is preserved, adapted, removed and out of scope.

## PWA behavior baseline

- The landing page communicates the product and shows one obvious, branded install CTA with a short value proposition. The website remains usable without installing.
- Never automatically cover a first-time visitor, account screen, form or other task route with a blocking install modal. Open the branded install journey after an explicit install action.
- Embedded-browser escape gates are a separate product decision, not a default install prompt. If required, use one accessible branded gate with one clear OPEN IN BROWSER action; do not stack dialogs or trap customers.
- When available, capture `beforeinstallprompt` and call it directly from the customer's click. Do not assume every browser supports it. Otherwise provide accurate platform-specific steps in the same branded install journey.
- Respect installed/standalone state and dismissal. Dismissing guidance must not redirect, reload the homepage, lose the customer's intended route, or cause a prompt loop.
- Keep one authoritative install state machine/root controller. Avoid duplicate listeners, duplicate dialogs, stale prompt events, route interception and competing install UIs.
- Never simulate installation or use JavaScript `alert()` for install guidance. Browser/OS installation consent remains authoritative.
- Make the whole browser-facing identity project-specific: manifest name/short name, icons, colors, metadata, install text, offline copy, URLs and service-worker cache prefixes. Search the entire repository for the old app name, assets and project IDs.
- Version the service worker intentionally. Delete only obsolete caches belonging to this app. Never use cached public shells to serve private account, request, message, token or admin content. Do not broadly cache authenticated responses.
- Keep a distinct, honest offline route and safe update/recovery behavior. Cached UI does not prove that a write was sent or accepted. Where relevant, show local/queued/syncing/confirmed/failed states and prevent duplicate writes on retry.
- Maintain accessible labels, keyboard and focus behavior, visible focus, contrast, touch targets and reduced-motion support.
- Do not impose The Plug's account-first journey or embedded-browser gate on another product automatically. Preserve the mechanism, then adapt product policy deliberately.

## Clone identity and infrastructure reset

Before a clone's first production deployment, audit and adapt:

- App name, title, short name, description, favicon, PWA icons, theme/splash colors, social metadata, install dialog, offline text and contact details.
- Manifest start URL, scope, display mode and orientation.
- Service-worker registration, cache prefix/version, precache list, navigation fallback, update lifecycle and route-specific cache/network rules.
- Firebase project and web config, authorized domains, sign-in providers, Firestore/Storage rules, messaging sender/VAPID config, server credentials and data collections.
- All environment variables in local, preview and production environments; deployment target/domain; Git remote; external URLs and analytics.
- Auth guards and return paths, notification permission/status handling, support fallbacks and all source-specific business logic.
- Dependencies, CI checks, production build and deployment source SHA.

Never reuse BOEMO or The Plug credentials, tokens, databases, push keys or customer data. A build-time placeholder/fallback is not a working production configuration. If a required service is missing, fail safely with clear customer-facing guidance; do not initialize fake project settings, leak raw SDK errors or pretend an operation succeeded.

## Required verification checklist

Verify the actual target project, not just code patterns:

1. Fresh visit: correct identity, no unexpected blocking install dialog, usable landing page.
2. Install CTA: opens the one branded journey; native prompt only when supported and called from the click; otherwise accurate platform instructions.
3. Dismiss/continue: stays on the intended route; no redirect/reload loop, stacked modal or repeated prompt.
4. Installed/standalone launch: correct icon/name/theme/start route; no repeated install invitation.
5. Embedded browser: verify the intentional product policy; if a gate is required, it appears once and has a clear open-in-browser action.
6. Online routes: home, account/auth, forms/requests, admin and offline each render their intended content.
7. Offline and reconnect: no private content leaked through the public shell; updates recover honestly; writes are not duplicated.
8. Auth/notifications: test missing-config and configured paths separately. Verify real device/browser support. An HTTP success alone is not proof the OS displayed a push notification.
9. Identity scan: search old app names, icons, URLs, Firebase IDs, cache prefixes, text and assets.
10. Run typecheck, lint and production build; inspect diff and repository status; commit/push; independently verify that Vercel's READY production deployment points at the exact intended commit before asking the owner to QA.

## Instruction for a fresh ChatGPT/Codex session

Start by asking which repository is the target and which repository is the foundation if not already stated. Read this file plus both repositories' `AGENTS.md` files. Treat this checklist as a baseline, not proof that the foundation implements it correctly. Compare the actual code and deployment to the checklist, report gaps, and make the smallest controlled changes.

If cloning BOEMO, reuse only the mechanics that inspection confirms are reusable; reset BOEMO identity, Firebase resources, notification configuration and food-ordering business logic. If cloning The Plug, preserve its install journey and safe service-worker patterns while explicitly adapting its account-first and embedded-browser policies to the new product. If using PurePress or another foundation, inspect it with the same rigor. Never copy configuration blindly or claim success without evidence.

## The Plug public-storefront offline QA

For The Plug, public finds and offers may be retained locally only after they have been published for the public audience. Treat this cache as a convenience copy, not a source of truth:

- Show when the feed is using saved content and when it was last refreshed; clearly warn that prices, stock and availability may have changed.
- Cache only public product media with a bounded cache. Never cache account, request, message, admin or other private responses in the public shell.
- On reconnect, attempt to refresh from the live source. If refresh fails, keep eligible saved public content visible and make the stale/offline state explicit.
- Do not report a request, account change or save as successful without server confirmation. Offline mode is browse-only unless a separately designed and tested queue explicitly communicates pending/synced/failed states.
- QA sequence: open the storefront online and wait for items/images; enable airplane mode and revisit the storefront; verify saved items, stale timestamp and image fallbacks; attempt a network-dependent action and verify honest feedback; restore connectivity and confirm the feed refreshes.
- The default find-details disclaimer must remain usable if its settings document is missing or unreadable. Only authorized admins may edit it; restoring the default should remove the override rather than leave a duplicate setting.
