# Iteration 13 — Reusable PWA Foundation Contract

## Fast handoff for future implementation chats
- Read `FOUNDATION-BLUEPRINT.md` for the repository map, data boundaries, protected invariants, clone/reset checklist and verification steps.
- Read `CHAT-WIDGET-RESEARCH.md` before adding a chat helper. The current deterministic adaptation lives in `src/app/ServiceGuide.tsx`; that file separates the Sparkle Legacy reference from research-backed recommendations.
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


## Service Guide integration contract
- \`src/app/ServiceGuide.tsx\` is a scripted navigation assistant for this prototype, not AI or live support. Read \`CHAT-WIDGET-RESEARCH.md\` and the “Deterministic Service Guide” section in \`FOUNDATION-BLUEPRINT.md\` before adapting it.
- Keep its customer/admin actions wired to the existing page state and real handlers. Do not duplicate forms/data, invent completed actions, or make the guide required for the primary journey.
- Preserve conservative dismissible teaser behavior, mobile safe areas/dynamic viewport, keyboard/Escape support, reduced-motion styles, session-only history and truthful local/offline wording.
- In a new project, replace demo labels and actions with project-specific workflows, verify authorization for admin actions, and only add network/AI/human handoff integrations when explicitly designed and genuinely implemented.


## Customer account workspace adaptation contract

- The reusable account implementation is `src/app/AccountWorkspace.tsx`, integrated with `src/app/page.tsx`. Preserve and build on its useful account-holder capabilities: request/order history and status, email filtering, project-specific progress/gamification, a lightweight journal, a per-request customer ↔ admin conversation, and image/video/PDF attachments where the target project's upload rules allow them.
- For every new project and every existing project whose account is being improved, inspect that project's real customer journey, data model, authentication, staff/admin workflow, upload endpoints, offline strategy and privacy/security rules first. Then replace Iteration 13 labels, sample services, game theme, journal prompts, status names and helper copy with the target project's own context. Do not transplant a spa garden, game, prices, treatments, customer messages or business-specific content unchanged.
- The account should help a customer take the next useful step: see their own history, understand status versus confirmation, message the responsible team on a specific request, share relevant files, and return to supported project-specific extras. Keep sign-in proportionate and never reveal another customer's records.
- In this prototype, request data, conversation messages, statuses, garden progress and journal notes are browser-local. Customer and admin communication is a same-browser demo thread only; it is not email, live chat, a remote inbox, or cross-device sync. File attachments upload to UploadThing only while online (images/PDFs max 4 MB; videos max 16 MB); they are not queued offline. Never claim otherwise.
- When adapting to a real production app, replace local-only account state with a verified authenticated data path, enforce ownership and staff authorization at the server/security-rule boundary, and connect messages/notifications to a real team inbox only when the backend and delivery path are implemented and tested. Do not weaken security rules or expose all requests to make the UI work.
- Keep optional account extras and their data collection proportionate. Gamification should be playful and project-specific, never a misleading health, performance or customer-worth score. Journal privacy and retention must be stated truthfully.
- Verify customer-created messages/files are visible to the authorized staff workflow, staff replies/status changes return to the correct customer view, invalid/oversized files fail clearly, and offline text/local-state behavior is distinct from online upload or remote delivery. Update `README.md` and `CLONING.md` with any project-specific limits.
