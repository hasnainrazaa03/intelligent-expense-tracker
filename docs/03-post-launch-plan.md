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
- [x] Comprehensive keyboard-only a11y audit of every remaining flow/component. *(Done as 4b: keyboard support throughout, axe 0 issues on every screen and popup, enforced in CI.)*
- [x] E2E coverage for import/restore, AI chat, and tuition flows. *(Done as 4c, and extended since: 44 flows.)*
- [ ] Formal `/security-review` + `/code-review high` on the cumulative diff.
- [x] Service-worker "update available" toast. *(PR #57)*

### A6. Scaling readiness (only when traffic warrants)  *(effort: M)*
- [x] **SRV-L16** Rate limits, failed-login lockouts and the daily AI budget are counted in Redis (Render Key Value) when `REDIS_URL` is set, with an in-memory fallback; audit events already go to stdout. *(5f-3)*
- [x] Gate Swagger UI (`/api/docs`, `/api/openapi.json`) — off in production unless ENABLE_API_DOCS=true. *(PR #57)*
- [x] Encrypt on-disk backup files: `npm run db:backup` writes AES-256-GCM files (key from a passphrase via scrypt), covers every collection, and leaves out one-time codes and reset tokens (they were in the plain files). *(5f-2)*

---

## Section B — Feature backlog (prioritized)

Effort: **S** ≈ 1–3 days · **M** ≈ ~1 week · **L** ≈ multi-week. Ordered by value/effort.

### Tier 1 — cheap, high-impact (lean on existing infra)
1. [x] **Subscription price-creep detector (S)** — flag recurring charges whose amount rose vs the prior cycle; show cumulative spend. *(PR #52)*
2. [x] **Spending anomaly cards (S)** — "Dining up 60% vs your recent average" spike detection in the planning insight cards. Full AI/email digest still open. *(PR #52)*
3. [x] **Emailed summary (S)** — on demand ('email me a summary', Resend), and monthly with the alerts by email (6f): the summary of last month goes out early in the new month to users who turn email on.

### Tier 2 — flagship value
4. [x] **Recurring transactions auto-materialization (S–M)** *(PR #54)* — a recurrence rule + on-login/scheduled job that auto-inserts due transactions with a confirm step. Today `isRecurring` is only a reminder.
5. [x] **Generalize multi-currency beyond USD/INR (M)** *(PR #55)* — the FX engine already supports all currencies; replace the hardcoded USD↔INR toggle with a currency picker. Biggest audience expander.
6. [x] **Push/email budget & bill alerts (M)** — Web Push since 5e-2 (#193): 80%/100% budget alerts, bill reminders, a monthly summary, from an hourly job. The email copy follows the alerts (6f).
7. [x] **Bank-statement CSV import with column mapping (M)** *(PR #57)* — map arbitrary bank exports + auto-categorize.
8. [x] **Savings goals as fundable objects (M)** *(PR #53)* — a `Goal` model with contributions and forecast-projected completion date.

### Tier 3 — larger investments
9. [x] **Net-worth trend (M)** — 6-month net-worth curve from transaction history + portfolio; investment accounts are saved to the server since 5b-1 (#186).
10. [x] **Offline write-queue (M)** *(PR #67)* — expenses added offline are queued in IndexedDB, shown optimistically, and auto-replay on reconnect, with an offline/syncing header pill.
11. [x] **Shared/household accounts (L)** — settle-up (#61), household foundation (#65), and **shared expense pooling (#66)**: tag an expense to a household, and a members-only pooled view with equal-split settle-up (who owes / is owed). Cross-user reads are membership-gated; tagging into a household you're not in is rejected. Verified with two real users.
12. [x] **Receipt image storage (M)** *(PR #68)* — downscaled receipt images stored in a separate collection (out of /all), attached/viewed/removed on an expense, cascade-deleted with it.

---

## Remaining work — why it isn't auto-completed

*(July 2026, kept for history: every item below has since shipped — A4 in #64, B9 and B11 by #66 and 5b-1, B3/B6 as push in 5e-2, A6 Redis in 5f-3, B10 in #67, B12 in #68. Current status is in [Section D](#section-d--november-2026-review-2026-11-17).)*

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

- [x] `NODE_ENV=production` on the backend (enables Secure/SameSite=None cookies + strict CORS). *(Checked 2026-11-17: the live session cookies are `Secure; SameSite=None`.)*
- [x] `TRUST_PROXY=2` on Render: requests pass Vercel's `/api` rewrite, then Render's proxy (it was `1` before PR #158 moved the API behind the site). The server refuses to boot in prod without it. *(Set in 2c; the production API runs.)*
- [x] `FRONTEND_URL` = deployed origin(s). *(Checked 2026-11-17: CORS refuses other origins with 403.)*
- [ ] Rotate + inject secrets via the platform store (`JWT_SECRET` ≥32, `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`).
- [ ] Load-balancer readiness probe → `GET /health/ready`. *(The endpoint answers in production; whether Render's health check uses it is a Render setting: Settings → Health Check Path.)*
- [x] Run `npm run db:push` once for any additive schema fields. Done against production on 2026-11-17 (created `RevokedToken` and `UserSettings` with their indexes). Re-run after any schema change.

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
| 6f Alerts by email | Settings → Notifications → By email: the hourly job emails each budget alert, bill reminder and monthly summary to the account address too, once, for users with or without a device; Settings says when email isn't set up on the server (`GET /api/push/status`). A notice nothing delivered is retried next run; sends are spaced for Resend's rate limit; one-click unsubscribe (signed link and `List-Unsubscribe` headers). Reaches everyone once Orbit sends from its own domain | #207 |
| 6e Shared lock, plan tidy | The lock that keeps an offline replay or a double-submitted import from saving twice can hold across API instances (`SHARED_LOCKS=on` with Redis; 503 rather than saving unlocked); the plan's finished items are ticked, and the production settings verified | #206 |
| 6g Review fixes | A code review of #202–#205 found real bugs, fixed here. Opening another record (or Ctrl/Cmd+N) while a form was open kept the old record's details and could save a duplicate (both dialogs are now one per record, and the shortcut waits for an open form); the tuition pay route still rolled 30 February into March; a backup holding an odd old year (0026) couldn't be restored; weak or unchanged new passwords counted toward the five-wrong-passwords lockout; two password changes at once could sign out the device that made them; the lists' "this month" didn't move on at midnight (nor on a laptop opened in the morning), while the charts did; deleted subcategories were still suggested; category edits didn't regroup the report charts | #208 |
| 6d Categories everywhere | Custom subcategories reach the budget manager, the statement importer and the AI (receipts, statements, AI fill), deleted ones stop being offered, and lists update live when categories change; the category manager refuses a name already used. `ExpenseModal` and five other components drop their hooks-rule suppressions, so the React Compiler checks them too | #205 |
| 6b, 6c Lint | The server is linted (14 findings fixed, #203). React Compiler readiness rules on as errors with their 41 findings fixed: `useToday()` instead of `new Date()` during render (screens left open overnight move on at midnight), state that follows props during render instead of effects, `useEffectEvent` for latest-callback refs (#204) | #203, #204 |
| 6a Account and dates | Change password while signed in (other devices signed out, this one renewed, a notice emailed); a paid tuition installment's date can be changed from the tracker; the API starts without a Resend key (email off) instead of crashing; dates are stored as the calendar day sent, and impossible days are refused (SRV-L5) | #202 |
| S13 PDF worker | Statement PDFs are read in a worker thread instead of the API process, where a 600-page statement held the event loop for its whole parse (every other request waited). The worker is stopped after 20 s, its heap is capped at 192 MB, and at most two run at once | #201 |
| 5f-3 Visit counts, shared counters | Vercel Web Analytics counts page visits: the script loads from the site itself and only on the production host, sends the path without its query (the Google two-factor redirect carries an email there), and stays off with Global Privacy Control, Do Not Track or the new Settings switch; the privacy policy says so. Rate limits, failed-login lockouts and the daily AI budget move to Redis (Render Key Value) when `REDIS_URL` is set, so restarts no longer reset them; when Redis is down or slow (300 ms) they fall back to memory, never blocking a request | #200 |
| 5f-2 Icons and encrypted backups | PNG app icons (192, 512, maskable, Apple touch, notification badge) and a 1200×630 Orbit share image replace the SVG-only icon and the USC-Trojan-style picture used for link previews (unused Trojan and title images removed). Full backups downloaded from the app can be protected with a passphrase (PBKDF2-SHA256 600k → AES-256-GCM, in the browser); restore asks for it. The operator's `npm run db:backup` is now encrypted (scrypt → AES-256-GCM), covers every collection, and leaves out one-time codes and reset tokens; `npm run db:decrypt-backup` reads it back | #199 |
| 5f-1 Copy and empty states | Plain language instead of codes like `ONLY_CSV_FILES_ALLOWED`, `INVALID_BACKUP_STRUCTURE`, `TWO_FACTOR_VERIFICATION_FAILED`, "Engine v4.0", "Budget protocols"; a verified email now says so on the sign-in page; lists emptied by a search or period say "Nothing matches" with Clear search and Show all time; quick-edit amounts say USD; Knowledge base rewritten | #198 |
| 5e-2 Push alerts | Web Push: budget alerts at 80% and 100%, bill reminders two days ahead, and last month's summary early in the month, between 9 am and 9 pm in the user's time zone, each sent once. An hourly GitHub Actions job calls `POST /api/jobs/notify` (shared secret), which also wakes Render. Settings → Notifications turns a device on and picks the kinds. Email follows once Orbit sends from its own domain | #193 |
| 5e-1 Reports period, CSV round trip | Reports get a period selector (this month, last month, 90 days, all time); budget use compares monthly budgets with the period's average month; plain labels instead of "Status: audited" and the "Certified audit" seal. The CSV export puts expenses and income in one file that the CSV importer reads back (account, tags, tax fields, original currency included), skipping rows already in the account; imports over 500 rows no longer fail; a budgets-only PDF no longer throws; backup restore keeps each income's account | #191 |
| 5d-2 App.tsx split | `App.tsx` 1,597 → 63 lines (routes and toasts). The signed-in app is `app/AppDashboard.tsx`, composing `useAllData` (the data and the "not loaded yet" guard, C2), `useTransactions` (React Query mutations: edits and deletes apply at once and roll back one item on failure; forms close only on success, C4), `useTuition`, `useRecurringSuggestions`, `useDataTransfer`, `useHubData`, and shell components | #190 |
| 5d-1 Tuition on the server | Paying an installment is one server request (creates the expense and marks it paid; a repeat returns the same expense); editing or deleting a tuition expense updates its installment on the server; the semester save can no longer change payment state, never deletes a semester, and carries a per-semester version so a stale tab's save is refused (409) and that tab shows the latest. Root causes of S2, S12, C3, F6 | #189 |
| 5c Privacy and terms | `/privacy` and `/terms`, written against what the code stores and sends: every service that handles data, exactly what each AI feature sends to Gemini (paid tier: not used to improve Google's products), retention, export and deletion, contact. Linked from the landing page, sign-up (agreement line), sign-in, and Settings; the receipt, statement and AI Analyst screens now say Gemini reads what they send | #188 |
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
- [x] 5c Privacy policy and terms (#188). Plain-language drafts, not reviewed by a lawyer. Keep `client/src/components/legal/PrivacyPolicy.tsx` in step with the code, and bump `LEGAL.lastUpdated` in `client/src/config.ts` when either page changes.
- [x] 5d-1 Tuition reconciliation on the server (#189): `POST /api/semesters/:id/installments/:id/pay`; expense PUT/DELETE keep the installment in step; `POST /api/semesters` saves structure only, with `Semester.version` (409 `SEMESTERS_CHANGED` with the current copy). Unsaved default semesters carry version -1. Older cached clients still work: a link they save is accepted only if it points at a real, unused Tuition expense.
- [x] 5d-2 Split `App.tsx` into feature hooks with `useMutation`, optimistic updates, rollback and error toasts (#190). The app's data now loads only on `/app` (not while a signed-in user reads `/privacy`).
- [x] 5e-1 Reports period selector and round-trip CSV export (#191, improvement 17).
- [x] 5e-2 Budget and bill alerts and a monthly summary, by Web Push (#193, improvement 16; B3, B6). To switch on: VAPID keys and `CRON_SECRET` on Render, `CRON_SECRET` as a GitHub Actions secret (runbook, "Push notifications").
- [x] The same alerts by email (6f): Settings → Notifications → By email sends every notice the hourly job makes to the account address too, claimed once for both channels. Built and tested; it reaches everyone once `EMAIL_FROM` is on a verified domain (5a). Until then Resend's test sender only delivers to its owner.
- [x] 5f-1 Copy and empty states (#198, improvements 14 and 15).
- [x] Net-worth accounts saved to the server: done in 5b-1 (#186).
- [x] 5f-2 Real PWA icons (192 and 512 px PNG, maskable, apple-touch-icon, notification badge) and an Orbit OG image; encrypted database backups (A6) and passphrase-protected backup downloads.
- [x] 5f-3 Visit counts with Vercel Web Analytics (path only, no cookies, off with GPC or Do Not Track or in Settings) and shared counters in Render Key Value (A6, SRV-L16). To switch on: enable Web Analytics on Vercel; create the Key Value and set `REDIS_URL` on Render (runbook).

**Also open**
- [x] PDF statement parsing runs in a worker thread (the rest of S13): stopped after 20 s (`PDF_PARSE_TIMEOUT_MS`), heap capped at 192 MB, at most two at once; on failure the PDF itself goes to Gemini, as before.
- [x] `utils/keyedLock.ts` can hold across instances (6e): with `SHARED_LOCKS=on` and Redis, a Redis lock after the in-process queue (`SET NX GET PX`, token-checked release with a retry). It never fails open while Redis is up: a lock it can't get in 10 s answers 503 for the client to retry. Off by default, since one instance needs only the in-process lock. A partial unique index on `(userId, clientRequestId)` would be stronger still.
- [x] The server starts without `RESEND_API_KEY`, with email off (the Resend client is created on first use; `new Resend('')` threw at boot).
- [ ] Rotate production secrets (P3).
- [x] A3: custom categories everywhere (6d). PR #56 built the store, but the budget manager and the statement importer still listed the built-in categories (custom ones missing, deleted ones offered) and nothing re-rendered when categories changed. Now every list reads `useCategories()`, the category manager edits the store directly and refuses a name already used, and the server's AI routes offer and accept each user's own subcategories (`server/src/utils/categories.ts`, one copy of the built-ins).
- [x] SRV-L5: `parseValidDate` stores the calendar day that was sent, at midnight UTC ("2026-10-05T23:30-07:00" was stored as 6 October), and refuses days that don't exist ("2026-02-30" used to roll into March).
- [x] A paid tuition installment's date can be changed in the tracker ("Change date"); it moves the tuition expense's date, which the server mirrors onto the installment.
- [x] React Compiler readiness: the 41 findings are fixed and the four rules are errors in `client/.oxlintrc.json` (6c). Dates come from `useToday()` (moves on at midnight), state follows props during render instead of in effects, latest-callback refs use `useEffectEvent`. Two documented exceptions: the once-per-load recurring snapshot and an async IndexedDB count.
- [x] `ExpenseModal` starts from the record (initial state), derives the USD amount, and suggests a category where the title changes (6d). The compiler skipped it, and five other components, because of `eslint-disable react-hooks` comments; all six are gone, with the findings they hid fixed (date picker, tuition autosave, auth start-up, currency picker, budget manager).
- [x] The server is linted (oxlint 1.90.0, correctness rules as errors, `npm run lint`), in CI's "Server · typecheck" job. Its 14 findings are fixed: unused imports and variables, two 500 handlers that hid the error from the logs, and a GET with a body in two test scripts.
- [ ] The weekly Dependency Audit workflow isn't a required check (it only runs when a PR touches a `package*.json`). Watch its Monday runs; it had been failing unnoticed since at least May.
- [ ] Remove the `deepmerge-ts` override in `server/package.json` if a Prisma 6.x release picks up deepmerge-ts 8. *(Checked 2026-11-17: 6.19.3 is still the latest 6.x, and @prisma/config 6 still pulls deepmerge-ts 7.1.5.)*
- [ ] Check `EMAIL_FROM` on Render. `onboarding@resend.dev` is Resend's test sender and only delivers to the Resend account's own address, so other people's sign-up codes may never arrive. Sending from a verified domain fixes it (see 5a).
- [x] Group `tailwindcss` and `@tailwindcss/*` in Dependabot, like React (#192); `@tailwindcss/postcss` aligned to 4.3.5.
- [x] Change password while signed in (Settings → Security): needs the current password, signs out every other device, keeps this one signed in, and emails the owner. Five wrong passwords per 15 minutes lock it.
- [x] picomatch ReDoS (GHSA-fc5q-39xc-vjpf, no fixed release yet) failed the Dependency Audit on every dependency PR. The audit now fails on high+ advisories in production dependencies and on critical ones anywhere (#192).
