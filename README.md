# Big Brothers Car Wash

Customer-first, mobile-first car-wash PWA for Big Brothers Car Wash in G-West, Gaborone, Botswana. This repository contains the actual Big Brothers application; it is not the generic Iteration 13 Service Studio demo.

## Customer journey

1. **Join the walk-in queue.** The customer enters their name and WhatsApp number, optionally describes their car, selects an active admin-published priced service or proposes a price, and can add notes. A proposed price is not the final agreed charge.
2. **Send the app link to WhatsApp.** Only after the server confirms the queue entry, the handoff screen offers **Send app link to my WhatsApp**. It opens a prefilled WhatsApp message addressed to the number entered. The person must check the recipient and press **Send** themselves. A copy-link fallback is available. Offline drafts are clearly identified and do not show the successful queue handoff until synchronization succeeds.
3. **Wait and race.** The handoff screen links to Big Brothers Racing. On the homepage, the customer account is above the racing section, and the racing section sits immediately above the footer.
4. **Wash completed and receipt issued.** Staff update the queue status to completed, record the actual final charge, optional agreed tip and actual payment state/method, then create a secure receipt link. The receipt can be opened, copied/shared, or prepared for WhatsApp/email. The receipt page provides a branded PDF download and optional secure account-claim and future-booking actions.
5. **Return.** Customers can open My BB CW Account for their own account/receipts and request a future wash. Booking requests remain pending until staff confirm them. Reminder and announcement notifications are opt-in.

## Staff workflow

Open **Staff sign in** from the footer. Authorized staff can manage bookings and walk-in queue statuses, review customer details, record final charges/payment status for completed queue jobs, create/reuse receipt links, prepare WhatsApp/email receipt messages, manage services/settings, and review racing activity. Staff access must remain protected by the existing authorization checks and 24-hour session policy.

Receipt links are time-limited, unguessable links scoped to a single receipt. A receipt link is not proof of account ownership. Account claim must use the receipt's verified claim flow; never merge records based only on a typed phone number.

## Development

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run verify:identity
npm run lint
npx tsc --noEmit
npm run build
```

Configure local values using `.env.example`. Public Firebase web configuration is intended to reuse the existing Vula Firebase project and its data, as documented in that example. Server-only credentials and operations secrets must remain in environment variables and must never be committed. Do not make Firestore or Storage public to bypass permission errors.

The build prepares the racing assets and runs identity verification. Build/test success does not prove that production environment variables, Firebase rules, live WhatsApp handoff, push delivery or Vercel deployment are configured correctly.

## Protected PWA installation and offline behavior

Installation is protected infrastructure. Preserve the approved Africhiko installation behavior and the current project-specific branding: capture the real `beforeinstallprompt` event early, retain it, and invoke the native prompt only from the user's explicit branded install-button click when available. Keep the dismissible branded card, responsive placement, close/reopen behavior, embedded-browser handoff, iPhone Safari Share → Add to Home Screen guidance, service-worker registration, update/refresh behavior, offline fallback and cache isolation intact. Do not replace the native prompt with a fake prompt, duplicate banner, alert or dead button. Do not modify install or service-worker files for unrelated queue, receipt, account or game work.

Offline queue drafts remain local until server sync succeeds. Do not describe local data as shared or tell a customer they are in the staff queue until Firestore confirms the write.

## QA checklist

- On a narrow phone screen, submit a valid queue entry and confirm the shared staff queue receives it once.
- Confirm invalid WhatsApp numbers are rejected before submission.
- Confirm the post-submit handoff opens WhatsApp with the correct entered number and app URL, and that the customer must press Send. Test the copy-link fallback too.
- Disconnect the network before submitting: verify the entry is labelled device-local and the successful WhatsApp handoff only appears after confirmed sync.
- In staff operations, move a test entry through waiting → in service → completed; record the actual charge/payment state; create and open the receipt; prepare the WhatsApp message; verify the PDF download and receipt expiry/revocation behavior.
- Confirm receipt account-claim is optional and verifies ownership, and that a customer cannot access another customer's account/history.
- Verify account-before-game order and that Big Brothers Racing remains immediately above the homepage footer. Test racing controls and progression separately; this work must not alter game mechanics.
- Test booking availability and pending/confirmed states, notification opt-in, guest/session clearing on the shared staff phone, PWA install/update/offline behavior, and responsive layouts.
- Run identity verification, lint, TypeScript and production build. Test the deployed app and real WhatsApp/device behavior separately. A GitHub push or successful build does not prove deployment success.

## Source of truth

Follow [AGENTS.md](./AGENTS.md) before implementation. Preserve working behavior and inspect the actual repository before making changes. Never force-push or rewrite history to resolve a source mismatch.

## Release checkpoint

After a fresh push to `main`, verify GitHub Actions and the Vercel deployment independently. A new commit requests another build attempt; it does not prove that the build or production deployment succeeded.
