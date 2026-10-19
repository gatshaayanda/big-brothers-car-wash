# Iteration 13 — Reusable PWA Foundation Contract

## Fast handoff for future implementation chats
- Read `FOUNDATION-BLUEPRINT.md` for the repository map, data boundaries, protected invariants, clone/reset checklist and verification steps.
- Read `CHAT-WIDGET-RESEARCH.md` before adding a chat helper. The widget is not implemented in this prototype; that file separates the Sparkle Legacy reference from research-backed recommendations.
- README is the customer/admin demo walkthrough. Do not assume an earlier conversation summary is newer than the repository.

## Purpose
Iteration 13 is the reusable, customer-first PWA prototype and candidate foundation for future projects. It demonstrates responsive customer journeys, browser-local demo workflows, installation, iPhone guidance, offline behavior, and staff/admin patterns. The service catalogue is sample content, not a real business offering.

## Source of truth and workflow
- Product owner / final reviewer: the user. Implementation: ChatGPT.
- GitHub is the source of truth. Inspect the actual branch, latest commit, working tree, instructions, routes, service worker, install code and tests before changing them.
- Existing project workflow: START → INSPECT → BUILD → VERIFY → CHECKPOINT. Keep inspection proportional; do not endlessly re-audit a repository whose context is established.
- Unexpected result: STOP → inspect actual state → identify the first failure → fix → verify.
- Preserve successful behavior. Prefer focused changes over rewrites. Never claim a test, deployment, device test, offline write or Firebase workflow passed without evidence.
- When authorized, push changes to `main`. The user handles Vercel deployments unless explicitly delegated.

## Reusable product principles
- Customer action first. Make the next step obvious, reduce unnecessary navigation, and keep copy concise.
- Mobile-first, accessible, legible UI; WCAG 2.2 AA contrast is the baseline. Verify keyboard focus, narrow layouts, empty/error/loading states and touch targets.
- Real workflows over decorative controls. Validate forms, persist state, expose useful feedback, and make admin changes visible to the customer view. Use visible press/focus states and accessible, dismissible toasts for meaningful outcomes; never claim a local write succeeded unless localStorage accepted it. Avoid JavaScript alert/confirm for routine UX.
- Keep account creation proportionate. Let customers explore before requesting credentials unless a real product requirement demands otherwise.
- Minimize Firebase reads/writes. Do not change Firebase config, rules, collections or production data without explicit instruction.
- Keep demo data, project-specific requirements and unverified ideas distinct. Local browser storage is not shared persistence, authenticated access, a server database or cloud synchronization.

## Demo behavior
- The customer service-order demo on `/` uses localStorage intentionally so a reviewer can submit an order without Firebase credentials.
- Demo services, prices, media URLs, announcements, customer requests and statuses are editable locally. The admin demo is a prototype control surface, not a security boundary and not suitable for real customer data.
- The requested timeline date is a customer preference, not a confirmed delivery commitment. No payment is taken.
- Never describe local-only changes as synced to a server or shared with another device.
- Preserve the PWA pattern lab at `/patterns`, the iPhone installation guide at `/iphone-install`, and the existing offline guide.

## Installation — protected behavior
Installation currently works and must not be casually rewritten. Before touching any PWA identity/icon/install files, inspect their actual implementation and consult current primary documentation (MDN and web.dev; Apple guidance for iOS).
- Preserve the early `beforeinstallprompt` capture in `src/app/layout.tsx`, the retained one-shot event, the `iteration13-open-install` click event, and the user-initiated call to the native browser prompt in `src/app/pwa-register.tsx`.
- Do not fake a native prompt, consume the prompt before the user clicks, or replace the working install action with a dead button.
- Keep the embedded-browser handoff and `/iphone-install` Safari Share → Add to Home Screen guide, including its referenced media assets.
- Inspect both `public/manifest.webmanifest` and `src/app/manifest.ts` before changing manifest output. Verify which manifest Next.js actually serves; do not assume similarly named files are interchangeable.
- Change icon artwork separately from install mechanics. Keep valid manifest icon paths, MIME types, purpose and supported sizes. Do not delete or rename an icon until every reference is updated and the built manifest/assets have been checked.
- Keep service-worker cache namespaces scoped to Iteration 13. Preserve update detection, the visible refresh action, offline fallback and existing privacy boundaries. Do not cache private Firebase responses as public content.
- After any install-related change, run identity verification and build/lint checks, inspect the served manifest and assets, and state that real Chrome/Android and iPhone/Safari testing remains for the product owner unless it was actually performed.

## Verification and reporting
Run `npm run verify:identity`, `npm run lint`, and `npm run build` when the available environment permits. Report the exact commit/branch, checks actually run, deployment status separately, and concise QA steps. A successful GitHub push does not prove a successful Vercel deployment.
