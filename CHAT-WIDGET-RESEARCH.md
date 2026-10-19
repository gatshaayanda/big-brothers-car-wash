# Chat widget — Sparkle Legacy reference and UX direction

This is a research/implementation brief, not a claim that chat is already implemented in Iteration 13.

## Reference inspected

Source: `gatshaayanda/sparkle-legacy-insurance-brokers`, branch `master`, `src/components/ChatWidget.tsx`, mounted from `src/app/layout.tsx`.

The component already has a useful **deterministic funnel**:

1. **Browse / page help** — user opens a floating chat control and gets a clear welcome message plus suggested prompts.
2. **Inquire** — user selects a quick reply or types a question; the component sends the message to `/api/fake-bot` with the current pathname.
3. **Lead capture** — “Get a quote” opens a structured form (name, phone, cover type, product, city/town, notes).
4. **Handoff** — it formats the collected details and recent chat transcript into a WhatsApp message.
5. **Return visit** — messages and lead details are stored in browser localStorage; an unread count is shown on the floating button.

Useful patterns to preserve conceptually:
- Quick replies make the next action easier than forcing every user to type.
- The funnel separates browsing/help, inquiry, structured details and external handoff.
- The chat context is included in the handoff so the customer does not have to repeat everything.
- The lead form is optional and can be skipped for a direct handoff.
- The component offers Escape-to-close, typing feedback, close/clear controls and saved local history.

Do **not** copy the insurance-specific labels, product routes, phone number, WhatsApp dependency, or claims about secure help into a generic service studio. The current widget calls `/api/fake-bot`; the expected `src/app/api/fake-bot/route.ts` was not present in the inspected repository path, so the component's catch/fallback path must be checked before relying on dynamic responses. The fallback replies are canned; this is not evidence of a real AI assistant.

## The “preview popup” finding

In the inspected `master` component, I found a floating chat button and an opening welcome message after the user opens the panel. I did **not** find a separate pre-open teaser/preview bubble in that component version. If the preview bubble was in another branch, commit or separate component, that version needs to be located before copying it. Do not invent its original text or behavior.

## What UX research recommends

### 1. Keep the invitation user-controlled

Baymard's public usability research found that intrusive overlays, unsolicited chat popups and persistent floating chat controls can interrupt browsing and obscure important mobile UI. Its recommendation is to make chat easy to find where people expect help, but let the user initiate it. If a proactive teaser is tested, keep it small, dismissible, shown conservatively and never repeatedly reopen it after dismissal.

Source: https://baymard.com/research-articles/live-chat-usability-issues

### 2. Make chat an action guide, not a novelty

NN/g's customer-service chat guidelines emphasize clear expectations, distinct message roles, understandable controls and recovery from interruptions. For this prototype, a helpful chat should direct users toward known actions and honest answers rather than pretending to be a human or an AI that can do things it cannot.

Source: https://www.nngroup.com/articles/chat-ux/

### 3. Design mobile first

- On a phone, open a near-full-screen panel that respects dynamic viewport height and safe areas; do not let a 33–39rem fixed panel overflow short screens or cover the order form.
- Keep a clear header, visible close/minimize action, readable message bubbles, quick-reply chips and a pinned composer above the keyboard.
- Keep the floating launcher away from primary actions and the install CTA. Let users dismiss a teaser; remember that choice.
- Avoid forcing a typing interaction when a 1-tap service choice is enough.
- Support Escape, focus return, visible focus, labelled controls and sensible keyboard behavior.
- Respect `prefers-reduced-motion`; animations should reinforce state changes, not delay or block them.

### 4. Use a deterministic, explainable funnel

For a generic service studio, recommended state machine:

- **Welcome:** “Want help choosing what to build?” with choices: “Website”, “App”, “Monthly support”, “Phaser game”, “Track a request”, “Just browsing”.
- **Service selected:** explain the starting price and one sentence about fit; offer “Request this service” and “Compare services”.
- **Request handoff:** preselect the service in the existing order form and move focus/scroll to the next required field. Do not ask the same details twice.
- **Account path:** “View my requests” leads to My account and explains that this demo is local to this browser.
- **Human/external handoff:** only offer WhatsApp/email/contact when the actual project has supplied and verified those endpoints.
- **Fallback:** admit what the helper cannot answer and offer a real page/action. Do not label scripted routing as AI.
- **Offline:** service-choice routing and page links can work locally; network-dependent messages/handoffs must say when they need a connection. Do not show a fake “sent” state.

This is a proposed reusable pattern, not implemented functionality.

### 5. Test the widget as a product flow

Track local/demo events only when privacy is clear: launcher shown, opened, dismissed, quick reply selected, service form started, request submitted, account opened, handoff clicked, and completion/drop-off by funnel step. Avoid collecting message contents by default. Compare completion and task success, not just number of chats opened.

Test at 320px width, a short mobile viewport with keyboard open, 200% text zoom, keyboard-only, reduced-motion mode, offline after first load, and a screen reader. Confirm it never obscures the primary CTA, cannot trap focus, can be closed easily, and preserves user progress after interruption.

## Proposed visual direction

A polished, compact “studio guide” rather than a generic support bubble:
- Small, calm launcher with an optional one-time teaser card near it (not an unsolicited modal).
- Teaser text: “Not sure which service fits? I can help you choose.” Buttons: “Help me choose” and “Not now”.
- The teaser appears only after the user has had time to browse, once per session at most, and stays dismissed when closed. Prefer not to show it on form entry/account flows.
- Opening panel uses a short greeting and 3–5 specific quick actions, with selected service context and a clear path back to the actual order form.
- Use subtle enter/exit motion, immediate button feedback and accessible success/error toasts; suppress nonessential animation for reduced-motion users.

Do not ship the teaser until it has a genuinely good mobile layout and a reliable dismissal policy. The core service journey must remain obvious without chat.
