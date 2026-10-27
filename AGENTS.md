# Big Brothers Car Wash — project instructions

## Source of truth and workflow
- The product owner is the final reviewer; implement working software, not plans alone.
- GitHub repository state, this file, README, actual code, Firebase rules, environment examples and verified checks are the source of truth. Inspect the current branch, commit, tree, and working tree before changing code.
- This is an existing car-wash product being adapted from Vula's Car Wash for the same business owner. Preserve working functionality and infrastructure where verified; do not rebuild from a generic foundation or overwrite local work to resolve a Git divergence.
- Current handoff warning: the initial push to this repository came from the local `main` branch after `git pull --ff-only origin main` failed because local and remote histories diverged. Verify the actual code against `gatshaayanda/vulas-car-wash` `main` before feature work. The intended product source is the latest verified Vula application, including its working racing game, authentication/data workflows, PWA installation and offline support—not the generic Iteration 13 demo. Do not force-push or rewrite history. Resolve the repository/source mismatch safely and transparently.
- Existing project workflow: INSPECT → UNDERSTAND → IMPLEMENT → VERIFY → CHECKPOINT. On unexpected results: stop, inspect actual state, locate the first failure, fix and reverify.
- Make focused changes. Run available identity checks, lint, tests and production build where feasible. Report code commits, push status, checks and deployment status separately. The owner handles Vercel deployment unless explicitly delegated.
- Never claim a Firebase rule, data write, notification, PDF, account link, build, device test or deployment succeeded without evidence.

## Business identity and customer-first priorities
- Product: Big Brothers Car Wash, G-West, Botswana. Use the owner's confirmed brand assets and real supplied photos/videos. Do not invent hours, prices, location details, services, capacity, available slots or contact details; make these editable admin settings or clearly marked configuration until confirmed.
- Primary action on the customer-facing home page: **Join the walk-in queue**. This is the main intake journey and must be immediately obvious on a phone.
- Keep the interface mobile-first, accessible, legible and quick to use on the staff member's smartphone handed to a walk-in customer. Use concise copy, appropriate touch targets, keyboard/accessibility support, validation and clear loading, empty, error, offline, success and pending states.
- Staff operations are secondary to the customer journey and must be behind real authorization. Do not add unnecessary forced sign-in before a walk-in can submit their details.

## Walk-in queue: required end-to-end workflow
- Intake form fields: customer's full name; phone number; vehicle type (e.g. sedan, SUV, bakkie); optional vehicle registration; service (default to the configured general walk-in service); optional notes.
- Primary submit label: **Join the queue**. Validate required fields and phone number reasonably; explain validation inline. Prevent accidental duplicate submissions and provide a clear reference/status after successful server persistence.
- Staff can manage queue order and wait-time estimates, update job/queue status, and mark jobs as started and completed. Wait estimates must be based on real staff-entered/configured data or clearly labelled estimates, never fabricated promises.
- Clearly distinguish a local/offline draft from a server-accepted queue entry. Never tell staff a customer has joined the shared queue until the server confirms persistence. Retry with a stable request ID where supported to avoid duplicates.
- The staff phone handoff is a privacy-sensitive shared-device flow: do not expose the previous customer's personal details, account, receipt or notifications to the next customer. After submission, provide a clear safe hand-back/finish state; clear transient form state and do not silently authenticate the customer as the staff member.

## Customer identity, accounts and future bookings
- The queue is the entry point to a durable customer relationship, not a dead-end form. Let customers join as guests without friction, then offer a clear way to secure/claim their customer account using their phone and a verified sign-in/linking method. Do not equate a typed phone number with verified ownership.
- Preserve a guest's queue/job history when linking an account where the auth provider supports safe identity linking. Do not create duplicate customer records or lose records during linking; use stable customer IDs and verified ownership checks.
- Customers should be able to return to their own job history, receipts, notification preferences and future bookings. Enforce customer ownership on the server/Firestore rules; never expose another customer's records through a guessed ID, phone number or URL.
- Offer future appointments after intake and in the completed-job/receipt journey, without distracting from the primary walk-in action. Customers can request a slot only from admin-configured opening hours and slots that are genuinely available.
- Admins manage opening hours, service durations/capacity and bookable slots through real CRUD. Prevent double-booking with server-side transactional/authoritative availability checks. A submitted booking is **requested/pending** until the business confirms it; never call it confirmed merely because a form submitted.
- Do not add payments or imply payment was taken unless a real verified payment integration exists.

## Completed jobs, PDF receipts and account handoff
- At the end of the day, staff/admin need a reliable view of completed jobs and a way to review the actual job details.
- For a completed job, generate or provide a real PDF receipt containing only verified information (business identity, job/receipt reference, date, vehicle/service, agreed charges and recorded payment state where available). Do not invent prices, taxes, payment or completion details. Make the PDF accessible to the customer via a secure, shareable link.
- Receipt links must be hard to guess, scoped to the intended receipt, revocable/expirable where practical, and must not grant access to the customer's full account. Avoid putting private customer details in URL parameters. A receipt link is a way to view/download that receipt, not proof that the recipient owns the account.
- The shared receipt page should invite the customer to securely claim/link their account, enable notifications if desired, and book a future wash from real available slots. These are opt-in actions with clear explanations. Do not claim account security, notification subscription or booking completion until each action succeeds.
- Staff must be able to find completed jobs and resend/re-copy the correct receipt link. Show meaningful errors if PDF generation, persistence or link creation fails; no fake download or fake success.

## Notifications and communication
- Reuse the existing verified Firebase Cloud Messaging / notification setup if it is present in the corrected Vula source. Inspect its implementation and required environment variables before changing it.
- Notifications should cover meaningful customer events (queue/job status, completed job/receipt ready, confirmed booking and relevant reminders) and authorized staff events (new queue entry, booking request, customer response) only when supported by the actual workflow.
- Ask permission in context and only when useful. Provide in-app status/history or a fallback when push is unavailable. Store and authorize tokens safely; allow customers to manage/disable notifications. Do not claim a notification was delivered merely because it was queued.
- Notification clicks should open the relevant authorized job, receipt or booking; test the destination and session behavior, not only that a push appears.

## Account/session UX and product personality
- Avoid repeated sign-in screens when a valid Firebase session already exists. On auth-state restoration, verify admin authorization using the existing server-side authorization route/rules; a remembered Google login alone must never grant staff privileges. Do not force the Google account chooser on every sign-in without a clear user request.
- Authorized staff sessions must expire after 24 hours. Enforce expiry on protected-route entry and at the deadline, clear authorization state, and require re-verification after expiry. Restore a still-valid authorized session from Firebase auth-state restoration without forcing a repeated sign-in or Google account chooser. A remembered Google login alone must never grant staff access. Do not weaken the staff allowlist, operations-word checks, server verification or role checks to improve convenience.
- Give customers a warm, contextual greeting using their verified/preferred first name when available; use a neutral fallback otherwise and avoid repeating their name everywhere. Admin greeting may use “Boss” if consistent with the owner's tone, followed by verified operational information. Counts, queue size, wait estimates and job statuses must come from live records, never sample numbers presented as real.
- A contextual guide/chat helper may reuse the Iteration 13 pattern only after inspecting its actual implementation and adapting it to this app. It should offer actions that navigate to real workflows (join queue, check my job/receipt, book a wash; staff review queue, completed jobs, booking requests). Do not create a duplicate account/data system or pretend a scripted helper is an AI. Never claim a message, booking or action succeeded unless the underlying workflow did.
- Weather is optional and secondary. Only show real, timestamped weather for a relevant business/site location if it helps plan outdoor work; do not use silent precise-location tracking or fabricated conditions. Do not let weather/chat/greetings displace the queue CTA.

## Firebase, data and security
- Verify the actual Firebase project/configuration and existing data model before implementation. Since this is the same owner/business as Vula, reuse that database/infrastructure only after confirming the repository configuration and intended project. Keep environment-specific values in environment variables; never commit service-account JSON, staff secrets, production env files or tokens.
- Do not make Firestore or Storage public to bypass errors. Apply least privilege and server-side/rule-based authorization for queue entries, customers, jobs, receipts, bookings, staff/admin actions and notification tokens.
- Align Firestore rules, indexes and actual query/write shapes. Do not claim rules/indexes are deployed just because their files are committed. Avoid exposing Admin SDK-only collections to browser clients.
- Keep UploadThing/Storage choice aligned with the verified current app and owner's requirements; do not migrate media infrastructure without explicit need. Real uploaded media must have validation, permission checks and failure feedback.
- Distinguish shared server persistence from browser-local demo/offline state. Never use demo/localStorage records for real customer data or describe them as synchronized.

## Protected PWA installation, offline support and racing game
- Installation is protected infrastructure. Preserve the approved Africhiko installation behavior: capture the real `beforeinstallprompt` event early, retain it, invoke the native prompt only from the user's branded install-button click when available, use the existing dismissible branded card and responsive placement, and preserve close/reopen behavior. Never substitute a fake prompt, JavaScript alert, duplicate/intrusive banner, forced install or dead button.
- Do not assume iOS Safari supports `beforeinstallprompt`; give accurate Safari Share → Add to Home Screen guidance. Keep embedded-browser open-in-browser handling, service-worker update/refresh behavior and cache isolation intact.
- Do not alter protected install files, lifecycle, service-worker registration/caches or installation UX for unrelated branding, account, queue, notification or game changes. Change only project identity/assets and genuinely required project-specific copy unless the owner explicitly authorizes an installation change.
- Preserve the verified Vula racing game and its controls, physics, assets, offline play, server-owned career/progression rules and existing routes. Do not recreate, remove, redesign or alter gameplay as part of the car-wash intake/account work. Inspect and identify protected files before any change touching them.
- Verify manifest, icons, metadata, service-worker registration, isolated cache namespaces, updates, refresh and offline fallback when installation/PWA files are intentionally changed. Test browser and installed-app behavior separately where possible; report unperformed physical-device tests honestly.

## Required QA checkpoint
Before declaring ready for owner QA, verify:
1. Walk-in intake on a narrow mobile screen, validation, duplicate-submit prevention, success/error/offline feedback and safe staff-phone handoff.
2. Staff queue ordering/status updates and accurate estimate semantics.
3. Customer can securely access only their own job and receipt; receipt PDF/link works and exposes no other data.
4. Account claim/linking preserves history and rejects unverified ownership.
5. Admin-configured opening hours/slots, availability checks, double-booking prevention and pending-versus-confirmed states.
6. Notification opt-in, token handling, meaningful events and click-through destinations where configured.
7. Existing sign-in/session authorization, racing game and protected installation/offline behavior remain intact.
8. Identity search, lint/tests/build and actual GitHub commit state; distinguish code checks from deployment and live Firebase configuration.

Keep this document aligned with verified architecture. Update README and related docs when the repository has been corrected to the intended Vula application; do not document imagined paths or claim the workflow is already implemented.

## Customer experience improvements — location, weather and waiting
- Keep **Join the walk-in queue** as the primary home-page action. Weather, location media, loyalty and account links are supporting information; none should compete with the queue action or introduce a forced account step.
- The optional Gaborone weather card uses Open-Meteo current conditions at the business-area coordinates supplied by the owner. Display the data timestamp and Open-Meteo attribution. Weather is contextual, not operational truth: do not infer whether the wash is open, promise a wash outcome, or block a booking based on weather. No browser geolocation or silent location tracking.
- The “Find us & enter” guide uses the owner-supplied `/videos/Left.mp4`, `/videos/Right.mp4`, and `/videos/Bays.mp4`. Videos must have native controls, descriptive labels, and `preload="none"`; never autoplay. The text should still explain what each clip shows.
- Offline video storage is opt-in because the three videos total about 104 MB. Explain the approximate download size before saving, show progress/status, cache only after the user explicitly asks, and never make video download a prerequisite for joining the queue.
- The service worker's location-video handler is additive to the existing offline implementation. It serves cached full MP4 responses with correct byte-range responses for offline seeking/playback. Do not alter the install prompt lifecycle, PWA registration, shell precache, update/refresh behaviour, or unrelated cache namespaces as part of these features. Verify byte-range playback in an installed browser and after disconnecting the network before claiming it works on devices.
- Account improvements should prioritize useful return visits: clear customer greeting/status, profile and vehicle details, current/upcoming requests, readable request status, secure receipts, repeat-wash shortcuts and transparent account-linking outcomes. Never fabricate loyalty awards, queue position, waiting time, booking confirmation or cross-account history merges.
- UX rationale: use progressive disclosure for secondary choices, make waiting state and next steps understandable, and give customers explicit control over video playback. Reference: Nielsen Norman Group, https://www.nngroup.com/articles/progressive-disclosure/ and https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/; waiting uncertainty study, https://pmc.ncbi.nlm.nih.gov/articles/PMC6615172/; Section 508 autoplay guidance, https://www.section508.gov/blog/avoid-auto-playing-content/; Open-Meteo licence and usage, https://open-meteo.com/en/features.

