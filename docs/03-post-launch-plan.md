# Post-Launch Plan — Remaining Fixes, Hardening & Feature Backlog

Derived from the multi-agent codebase audit run on 2026-07-15 (server security,
client correctness, feature/roadmap synthesis). The Phase 0–7 roadmap in
[02-roadmap.md](./02-roadmap.md) is closed; this document tracks what remains
plus the forward feature backlog.

**Latest:** a second full review on 2026-11-17 and its fixes are in
[Section D](#section-d--november-2026-review-2026-11-17), which also lists everything
still open. Start there.

## Status snapshot

- **Audit verdict:** no critical vulnerability, no IDOR (all data queries owner-scoped). Auth/CSRF/bcrypt/OTP/lockout solid.
- **Shipped from the audit:**
  - **PR #49** — client money-correctness: INR-edit rewrite (H1), inline-edit currency (H2), budget-chart overrun (M1), multi-word search (M2), split penny-leak (M4).
  - **PR #50** — server prod-hardening: trust-proxy default, security banner, per-user global rate limit, graceful shutdown, `/health/ready`, audit-to-stdout, HS256 pin.

---

## Section A — Remaining fixes

### A1. Low-severity correctness / labeling  *(effort: S — one batch)*  ✅ shipped PR #51
- [x] **L1** Reports header hardcodes "Fiscal year 2025 / full year" while the figures are all-time → label reflects reality.
- [x] **L4** `last_90_days` previous-period window is off by one (91 vs 90 days) → symmetric spans.
- [x] **L5** "This month" (partial, month-to-date) is compared against the *full* prior month, inflating the early-month delta → compare same-length month-to-date window.
- [x] **L6** All-time / 90-day monthly trend drops empty months (gappy chart) → iterate a continuous month sequence, fill zeros.
- [x] **L2** Current-month budget utilization shown beside all-time totals without a period qualifier → add qualifier.

### A2. FX fallback transparency  *(effort: S)*  ✅ shipped PR #51
- [x] **L3** Silent hardcoded ₹87.5 fallback when the FX fetch fails and no cache exists → expose an `isRateFallback` flag and show an "approximate rate" cue.

### A3. Custom categories single source of truth  *(effort: M)*
- [x] **CMP-M24** Single categories store (`utils/categories.ts`) consumed by the expense dropdown, the manager, and color/main-category resolution. *(PR #56)*

### A4. Money-as-integer-cents migration  *(DONE — PR #64)*
- [x] **X-3 / SRV-M8** Amounts are stored as integer cents (`Int`) end-to-end in the DB; the API converts to/from dollars at the boundary (`utils/money.ts`), so the client is unchanged. Migrated the live data (239 expenses etc.) via an idempotent script after a full backup; verified 239/239 exact + all surfaces (dashboard, tuition nested installments) + 13 E2E.

> **Deploy note:** after deploying, run once in `server/`: `npm run db:backup` then `npm run db:migrate-cents` (idempotent — a marker doc makes a second run a no-op).

### A5. Quality polish (Phase 7 tail)  *(effort: M)*
- [ ] Comprehensive keyboard-only a11y audit of every remaining flow/component.
- [ ] E2E coverage for import/restore, AI chat, and tuition flows (current suite covers auth, dashboard, nav, toggles, add-expense, search).
- [ ] Formal `/security-review` + `/code-review high` on the cumulative diff.
- [x] Service-worker "update available" toast. *(PR #57)*

### A6. Scaling readiness (only when traffic warrants)  *(effort: M)*
- [ ] **SRV-L16** Move rate-limit + audit state to Redis/DB so the server can run multiple instances. In-memory/file today.
- [x] Gate Swagger UI (`/api/docs`, `/api/openapi.json`) — off in production unless ENABLE_API_DOCS=true. *(PR #57)*
- [ ] Encrypt on-disk backup files (currently plaintext, secrets already excluded).

---

## Section B — Feature backlog (prioritized)

Effort: **S** ≈ 1–3 days · **M** ≈ ~1 week · **L** ≈ multi-week. Ordered by value/effort.

### Tier 1 — cheap, high-impact (lean on existing infra)
1. [x] **Subscription price-creep detector (S)** — flag recurring charges whose amount rose vs the prior cycle; show cumulative spend. *(PR #52)*
2. [x] **Spending anomaly cards (S)** — "Dining up 60% vs your recent average" spike detection in the planning insight cards. Full AI/email digest still open. *(PR #52)*
3. [~] **Emailed summary (S)** — on-demand 'email me a summary' via Resend (scheduled version still open). — reuse the existing report renderer + Resend.

### Tier 2 — flagship value
4. [x] **Recurring transactions auto-materialization (S–M)** *(PR #54)* — a recurrence rule + on-login/scheduled job that auto-inserts due transactions with a confirm step. Today `isRecurring` is only a reminder.
5. [x] **Generalize multi-currency beyond USD/INR (M)** *(PR #55)* — the FX engine already supports all currencies; replace the hardcoded USD↔INR toggle with a currency picker. Biggest audience expander.
6. [ ] **Push/email budget & bill alerts (M)** — server email (Resend) + Web Push (SW already present) for 80%/100% budget and bill-due reminders.
7. [x] **Bank-statement CSV import with column mapping (M)** *(PR #57)* — map arbitrary bank exports + auto-categorize.
8. [x] **Savings goals as fundable objects (M)** *(PR #53)* — a `Goal` model with contributions and forecast-projected completion date.

### Tier 3 — larger investments
9. [~] **Net-worth trend (M)** — 6-month net-worth curve from transaction history + portfolio. Server-persisted accounts still open. — promote localStorage-only investment snapshots to real accounts + historical net-worth trend.
10. [x] **Offline write-queue (M)** *(PR #67)* — expenses added offline are queued in IndexedDB, shown optimistically, and auto-replay on reconnect, with an offline/syncing header pill.
11. [x] **Shared/household accounts (L)** — settle-up (#61), household foundation (#65), and **shared expense pooling (#66)**: tag an expense to a household, and a members-only pooled view with equal-split settle-up (who owes / is owed). Cross-user reads are membership-gated; tagging into a household you're not in is rejected. Verified with two real users.
12. [x] **Receipt image storage (M)** *(PR #68)* — downscaled receipt images stored in a separate collection (out of /all), attached/viewed/removed on an expense, cascade-deleted with it.

---

## Remaining work — why it isn't auto-completed

Everything safely completable client-side without external services or a risky
data migration has shipped (PRs #49–#58). What's left falls into three buckets
that each need a deliberate decision:

1. **Needs a DB schema + data migration (deploy-affecting):**
   - **A4 money-as-integer-cents** — the highest-value remaining *fix*, but it
     rewrites `Float` → `Int` across the Prisma schema, every server route, and
     all client math, and requires migrating existing stored amounts. Must be its
     own isolated, heavily-tested effort with a one-time data migration.
   - **B9 net-worth persistence** and **B11 shared/household accounts** also add
     models (and, for #11, an invite/roles/auth surface).

2. **Needs external credentials/infra to build *and verify*:**
   - **B3 scheduled PDF email**, **B6 push/email alerts** — need a live
     `RESEND_API_KEY` + a scheduler/cron and Web-Push keys. Code can be written
     but not verified end-to-end here.
   - **A6 Redis** rate-limit/audit store, **B12 receipt image** blob storage.

3. **Large/again-risky client efforts:** **B10 offline write queue** (IndexedDB
   replay + conflict handling).

**A5 a11y:** an axe (WCAG 2 A/AA) scan now runs in E2E and passes on the landing
and dashboard (PR #63) — fixed an unlabeled select and deepened the dark-mode
accent to meet 4.5:1. The user-triggered **`/security-review`** still can't be self-run.

**Recommended next:** see [Section D](#section-d--november-2026-review-2026-11-17).
(A4, money-as-cents, shipped in PR #64.)

---

## Section C — Go-live checklist (deploy config)

The [deploy runbook](./04-deploy-runbook.md) is the up-to-date version of this list.

- [ ] `NODE_ENV=production` on the backend (enables Secure/SameSite=None cookies + strict CORS).
- [ ] `TRUST_PROXY=2` on Render: requests pass Vercel's `/api` rewrite, then Render's proxy (it was `1` before PR #158 moved the API behind the site). The server refuses to boot in prod without it.
- [ ] `FRONTEND_URL` = deployed origin(s).
- [ ] Rotate + inject secrets via the platform store (`JWT_SECRET` ≥32, `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`).
- [ ] Load-balancer readiness probe → `GET /health/ready`.
- [ ] Run `npm run db:push` once for any additive schema fields.

---

## Execution order

*(July 2026 order, kept for history. Current priorities are in Section D.)*

1. **A1 + A2** (correctness/labeling + FX transparency) — quick, safe, no schema. ← start here
2. **B1–B3** (Tier 1 features) — high value, no migration risk.
3. **A3** (custom categories) then **B4/B5** (recurring, multi-currency).
4. **A4** (money-as-cents) as a scheduled mini-project before further money features.
5. **A5/A6 + Tier 3** as scale/maturity demands.

---

## Pre-launch security review (2026-07-16)

Two-agent review of the cumulative session diff (`98de02a..HEAD`). **Household
authorization and the money-as-cents conversions were verified airtight/complete
on every path.** No critical/high issues. Fixed pre-launch (PR #69):

- **Offline idempotency (H1)** — offline creates now carry a `clientRequestId`; a replay returns the existing row (200) instead of duplicating.
- **Flush re-entrancy (M1)** — a `useRef` guard prevents concurrent flushes (mount + `online` event) from double-submitting.
- **Poison-item blocking (M2)** — a permanent 4xx item is dropped from the queue instead of blocking every later item forever; transient errors still retry.
- **Receipt fetch race (M3)** — the modal's receipt loader aborts on expense switch so a slow response can't paint the wrong expense.
- **Receipt size/type** — cap lowered to 900KB (under the 1MB body limit) with a clear message; raster-only allowlist rejects script-carrying SVG data URLs.
- **Settle-up drift (L1)** — pooled expenses are filtered to current active members so a member leaving can't skew balances.
- **Email output-encoding (L3)** + **migration crash-safety (M2)** — HTML-escape category names in the summary email; per-collection markers make the cents migration re-runnable after a partial run (overall-marker fast path still protects an already-migrated DB).

**Accepted / deferred (documented, low-risk):** members (not just owners) can invite — an intentional roommate-friendly choice; editing/deleting a not-yet-synced offline row is a narrow edge (bounded to an offline session) — documented; and household amounts render in `$` regardless of display currency (values are USD).

---

## Section D — November 2026 review (2026-11-17)

A second full review (client, server, deploy) found new bugs in data integrity,
security and correctness. They were fixed in phases, one PR per batch, and each fix
was checked in the browser or API against the original code before merging.

| Phase | What | PRs |
|---|---|---|
| 1 Data integrity | Tuition ↔ expense sync, safe restore and statement import, money in the entered currency (never a fallback rate), pending deletes survive unmount | #150–#153 |
| 2 Security | Sign-in hardening (code limits, verification, lockout, logout, Google), per-account local data, body and amount caps, per-user AI and email budgets, API through the site with security headers | #154–#158 |
| 3a Budgets | One rule for parent and subcategory budgets (F14, C8) | #159 |
| 3b Dates | Whole-month view, local due dates, recurring anchor day, the user's month in email summaries (C12, F15, C13, S19) | #160 |
| 3c Planning, tuition, households, AI | Loans subtract from net worth, per-semester installment box, household untagging, monthly AI budgets (F16, F10, S10, S9) | #168 |
| 3d Import, PDF, dialogs | CSV import, PDF currency text, Escape guard, wipe-all reset, small defaults (F18, F21, F13, C14, F22) | #170 |
| 3e Housekeeping | Offline tab switching and service-worker shell (C15); this tidy-up | #175 |
| Dependencies | Routine bumps; react and react-dom grouped in Dependabot | #161–#166, #169 |
| Dependency audit | `npm audit` clean (was 1 critical, 11 high): Vite dev-server RCE fix and the dev server back on localhost, jsPDF 2 → 4, Prisma's `deepmerge-ts` overridden to 8.x, transitive fixes; E2E test for both PDF exports | #179 |
| 5b-2 Settings page | One Settings page (account, preferences, security, data, delete account) opened from the header gear and the sidebar. "Sign out everywhere" (the server had it; nothing called it). Account deletion with the password, or a recent sign-in for Google-only accounts. Turning on two-factor asks first; the gear used to switch it on in one click | #187 |
| 5b-1 Settings on the server | Savings goals, investment accounts, custom categories, the merchant map, paused recurring charges, display currency and "hide tuition" move from localStorage to a per-account `UserSettings` document: they sync across devices, are in backups, and are removed by "Delete all my data" (goals and balances; preferences stay). Each browser's old values are merged in and uploaded once (C5) | #186 |

Found already done when re-checked in 3e: C17 (canonical link and JSON-LD point at the
live site), P4 (the demo seed script writes cents), and removing `server/prisma.config.ts.bak`.

### Still open

**Phase 4 — quality gates**
- [x] 4a CI on every PR (`.github/workflows/ci.yml`: lint, typecheck, unit tests, build, Playwright E2E against a real API and MongoDB). Linting uses oxlint, not ESLint: typescript-eslint doesn't support TypeScript 7 yet. React hooks rules are errors; the React Compiler readiness rules are off for now.
- [x] 4b Keyboard-usable date picker, labelled inputs, an accessible confirm dialog (focus trap and Escape), keyboard support for the currency picker, search, quick actions menu and category dropdowns, and AA contrast fixes in the dark theme (F19, F20). axe now reports 0 issues on every screen and popup (was 158); `tests/e2e/a11y.spec.ts` keeps it that way in CI. Replaces A5's accessibility item.
- [x] 4c Server test suite (`server/tests`: 12 unit + 19 API tests with supertest against a real MongoDB, run in CI) and E2E flows for CSV and statement import, backup restore, AI chat (mock Gemini) and tuition (`client/tests/e2e/flows.spec.ts`). The tuition test found that tuition expenses were titled with a database id ("Inst #6afbf9f7…"); they're now numbered #1, #2… Replaces A5's E2E item.

**Phase 5 — product**
- [ ] 5a Own domain, with the API on the same site. **Deferred (2026-11-17):** staying on the vercel.app address for now. The `/api` half already shipped in 2c (#158).
- [x] 5b-1 Settings and planning data on the server (#186): `GET`/`PATCH /api/settings`, per key, validated, money in cents; part of `/data/all`, backups (format 1.1.0) and restore. Theme and the statement importer's panel width stay per device.
- [x] 5b-2 One Settings page (#187): account (sign out, sign out everywhere), preferences (currency, theme, hide tuition), security (two-factor, with a confirmation to turn on and a password form to turn off), data (export and backup, categories, budgets), and account deletion. Deleting removes every record, deletes households the user owns (members keep their expenses, untagged), removes memberships and invitations, and clears this browser's cached data and offline queue for the account. Five wrong passwords per 15 minutes per account lock both deletion and turning two-factor off.
- [ ] 5c Privacy policy and terms.
- [ ] 5d Move tuition reconciliation to the server; split `App.tsx` into feature hooks.
- [ ] 5e Alerts, scheduled summaries, a reports period selector, round-trip export (B3, B6).
- [ ] 5f Copy, empty states, PWA icons, analytics, net-worth accounts saved to the server, Redis-backed limiter, encrypted backups (B9, A6).

**Also open**
- [ ] PDF statement parsing still runs on the main thread: move it to a worker with a timeout (the rest of S13).
- [ ] The server crashes at boot without `RESEND_API_KEY`; it should start with email disabled.
- [ ] Rotate production secrets (P3).
- [ ] A3: custom categories as a single source of truth (CMP-M24).
- [ ] SRV-L5: normalise dates to a calendar day on the server (`parseValidDate` still accepts any timestamp).
- [ ] A paid tuition installment's date can't be changed in the UI: `App` has the handler (`handleUpdateInstallmentDate`) but the tracker never calls it.
- [ ] React Compiler readiness: about 30 lint findings (`react/purity`, `react/set-state-in-effect`, `react/refs`), switched off in `client/.oxlintrc.json`.
- [ ] Lint the server too (it isn't linted yet).
- [ ] The weekly Dependency Audit workflow isn't a required check (it only runs when a PR touches a `package*.json`). Watch its Monday runs; it had been failing unnoticed since at least May.
- [ ] Remove the `deepmerge-ts` override in `server/package.json` if a Prisma 6.x release picks up deepmerge-ts 8.
- [ ] Check `EMAIL_FROM` on Render. `onboarding@resend.dev` is Resend's test sender and only delivers to the Resend account's own address, so other people's sign-up codes may never arrive. Sending from a verified domain fixes it (see 5a).
- [ ] Group `tailwindcss` and `@tailwindcss/*` in Dependabot, like React: #181 bumped `tailwindcss` to 4.3.5 alone, and the build still compiles with the 4.3.3 inside `@tailwindcss/postcss`.
- [ ] Change password while signed in (only the forgot-password flow exists).
- [ ] picomatch ReDoS (GHSA-fc5q-39xc-vjpf, no fixed release yet) fails the Dependency Audit on every dependency PR. It's only in dev tooling (Vite, Vitest, the dev server's file watcher), matching our own patterns; production dependencies audit clean. Decide whether the audit gates on production dependencies only.
