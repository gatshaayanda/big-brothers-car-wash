# START HERE — Iteration 13

**This is the mandatory entry point for every new ChatGPT/Codex implementation chat.** Do not ask the product owner which documents to inspect. GitHub `main` is the source of truth; chat history is supporting context only.

## Required reading order — before editing

**Golden baseline:** read [GOLDEN-BASELINE.md](./GOLDEN-BASELINE.md) alongside these instructions. It defines the recovery point, protected behavior and mandatory adaptation checks.

1. `AGENTS.md` — project rules, protected behavior, source-of-truth and safety boundaries.
2. `FOUNDATION-BLUEPRINT.md` — repository map, architecture, data model, protected install/offline invariants, verification and known limitations.
3. `README.md` — how the customer and admin demo currently works and what is already implemented.
4. `CLONING.md` — required when cloning/adapting this foundation, changing app identity/PWA assets, or reusing patterns in another project. Iteration 13 is now the default cloning foundation for new customer-first apps in this portfolio unless the product owner explicitly selects another source.
5. Read the relevant route/component docs and code referenced by those files, then inspect the actual latest commit, package scripts and CI/deployment state.

Do not stop after reading only one file. These documents have different purposes and are designed to be used together.

## Required workflow

### Existing Iteration 13 project
1. Establish current branch, latest commit, working-tree state, recent changes and failing checks.
2. Read the four documents above in the relevant scope; inspect only the implementation related to the task.
3. Preserve the install/PWA baseline, customer journey, service-worker/cache namespace, local demo data shape and UploadThing configuration unless the brief explicitly calls for changing them.
4. Implement the requested end-to-end behavior, including its customer and admin sides, validation, empty/error/success states, mobile layout and truthful offline behavior.
5. Run `npm ci`, `npm run verify:identity`, `npm run lint` and `npm run build` where an execution environment is available. If a check cannot be run, say so and use an available CI/deployment signal; never infer a passing build from a successful GitHub edit.
6. If a build fails, get the actual error log, fix the first failure, rerun checks, and repeat until green. Do not guess fixes or ask the product owner to debug logs that the agent can access.
7. Push to `main` when implementation/pushing is authorized. Confirm the exact commit on `main`, check the resulting production deployment status, and distinguish code pushed, build passed and deployment verified.
8. Hand off a concise QA checklist only after a successful build/deployment; include any unverified device/offline steps.

### New project cloned/adapted from a foundation
For a new app, use Iteration 13 as the default foundation unless the product owner explicitly chooses another source. Read `CLONING.md` and `FOUNDATION-BLUEPRINT.md`, inspect the actual target brief/repository, research the target product, and reset identity/infrastructure before building. For an existing app, inspect and improve that repository in place; never reclone it just to start work.

## Account workspace reuse
Before building/adapting any customer account, read the **Customer account workspace adaptation contract** in `AGENTS.md`, the matching section in `CLONING.md`, and the account/data boundaries in `FOUNDATION-BLUEPRINT.md`. Search online for the target product context and relevant account/dashboard UX research before choosing account extras or visual motifs. Keep all sections visually consistent; never carry a theme-specific gimmick (such as a spa garden) into an unrelated product by default. Preserve the useful capability set but fit it to the target project. Verify customer → admin → customer communication, attachment handling, data ownership, offline boundaries and account-specific copy. The current Iteration 13 account is browser-local demo functionality, not a secure cloud account or remote inbox.

## Known boundaries
- Firebase has intentionally been left alone for this prototype.
- Requests, status, announcements, customer/admin messages, garden progress, journal and preferences are browser-local demo data.
- Customer/admin replies are visible only in the same browser profile; no real remote inbox, email delivery or cross-device sync is configured.
- UploadThing uploads require internet and are not queued offline. Current limits: images 4 MB, PDFs 4 MB, videos 16 MB.
- The product owner handles Vercel deployments unless explicitly delegated, but the implementation agent must still inspect deployment/build status when it is available.
