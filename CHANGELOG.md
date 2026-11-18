# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 5 — product (2026-11-17)
- **Reports by period, and exports you can import back (#191):** Reports now cover this month,
  last month, 90 days or all time (they were all-time only), with budgets compared month for
  month. The CSV export holds expenses and income in one file that "Import CSV" reads back,
  skipping anything already in your account; imports of more than 500 rows work; restoring a
  backup keeps each income's account.
- **Faster edits, safer failures (#190):** editing or deleting a transaction now shows
  immediately; if the server refuses, that item goes back as it was and a message says so.
  A failed add or edit keeps the form open with what you typed. (Internally, `App.tsx`
  went from about 1,600 lines to 63, split into hooks and shell components.)
- **Tuition on the server (#189):** marking an installment paid is one request that creates
  the tuition expense and marks it paid together, so a double-click, a closed tab or a
  failed save can no longer leave the two out of step. Editing or deleting the expense
  updates the installment on the server. A tuition edit from a tab with an older copy is
  refused (and that tab shows the latest) instead of overwriting newer changes.
- **Privacy policy and terms (#188):** `/privacy` and `/terms` in plain language, including
  exactly what each AI feature sends to Google Gemini. Linked from the landing page,
  sign-up, sign-in and Settings; receipt scanning, statement import and the AI Analyst now
  say that Gemini reads what they send (the AI Analyst used to say "Private & secure").
- **Settings page and account deletion (#187):** one Settings page, from the header gear or
  the sidebar, for the account, preferences, security and data. New: "Sign out everywhere"
  and permanent account deletion (password, or a recent Google sign-in). Turning on
  two-factor sign-in now asks first: the gear icon used to switch it on with one click.
- **Settings on the server (#186):** savings goals, investment accounts, custom categories,
  learned category suggestions, paused recurring charges, display currency and "hide
  tuition" now belong to the account instead of one browser: they show on every device,
  are included in backups, and survive clearing the browser. The first sign-in after the
  update merges in and uploads whatever the browser still held. "Delete all my data" now
  also removes goals and account balances (preferences stay).

### November 2026 review fixes (2026-11-17, PRs #150–#179)
A second full review (client, server, deploy) found new bugs; each batch was checked
against the original code before merging. Details and what's still open:
[post-launch plan, Section D](./docs/03-post-launch-plan.md#section-d--november-2026-review-2026-11-17).
- **Data integrity (#150–#153):** tuition installments and their expenses stay in sync;
  backup restore and statement import can no longer lose data; money is taken in the
  currency it was entered in and never saved at a fallback FX rate; a pending delete
  survives the list unmounting.
- **Security (#154–#158):** sign-in hardening (code guess limits, verification, lockout,
  logout, Google); sessions and per-account local data kept per account; large bodies
  parsed only after auth, with caps on amounts and fields; per-user AI and email budgets;
  the API is served through the site with security headers; AI output hardened.
- **Correctness (#159, #160, #168, #170):** one rule for parent and subcategory budgets;
  whole-month views, local due dates and recurring anchor days; loans subtract from net
  worth; the installment box no longer carries over between semesters; leaving or deleting
  a household untags its expenses; the AI compares monthly budgets with monthly spending;
  CSV import reads "1,234.56", multi-line notes, refunds and Excel files; notes keep their
  line breaks; PDFs print rupees as "Rs"; Escape asks before discarding budget edits;
  "Wipe all data" resets the recurring banner and Tuition; no "CASH" default; rising
  spending shows red; deleting or leaving a household asks first.
- **Offline (#175):** switching tabs offline no longer reloads the app; the main screens are
  prefetched so they open offline, and a reload returns to the same screen.
- **Dependencies (#161–#166, #169):** routine bumps; react and react-dom now update together
  (a react-only bump would have rendered a blank page).
- **Quality gates (#176–#178):** every PR runs lint, typecheck, unit tests, build, a server
  API suite against MongoDB and Playwright E2E; all four are required to merge. The app is
  usable by keyboard and screen reader (axe: 0 issues, was 158). Tuition expenses are
  numbered "Inst #3" instead of by database id.
- **Dependency audit (#179):** `npm audit` is clean in both packages (was 1 critical and
  11 high). Vite 8.2.6 fixes a critical dev-server code-execution bug (GHSA-p4f5-76q4-ffq7),
  and the dev server now listens on this machine only (`npm run dev -- --host` to share it).
  jsPDF 2 → 4 with byte-identical reports; an E2E test now checks both PDF exports.
  Prisma 6's `deepmerge-ts` is overridden to 8.x; the rest are in-range transitive fixes.

Work planned in the [roadmap](./docs/02-roadmap.md), tracked against the
[codebase review](./docs/01-codebase-review.md). Items under **Fixed** have landed on the
`fixes/phases-1-4` branch; items under **Planned** are still queued.

### Redesign & hardening (2026-07, on `main`)
- **Cosmic-glass "Orbit" redesign** shipped across every surface (landing, auth, shell/nav,
  dashboard, lists, modals, planning, charts, reports, pivot, AI, tuition) with a two-theme
  token system, light/dark toggle, and a reusable UI primitive library (`components/ui/`).
- **Rebrand** USC Ledger → **Orbit** (USC/Bursar features & copy retained).
- **Category grouping fix**: Reports breakdown and the dashboard pie collapsed every expense
  into "Miscellaneous" when it was stored as a main category — new `getMainCategory()` helper
  handles main + subcategory values (regression-tested).
- **Perf**: modal jank fixed (opaque panels instead of stacked backdrop-blur); static
  starfield with blur limited to fixed chrome; measured ~30–90 ms tab switches.
- **Budget period fix**: the Budget-protocols panel measures current-month spend vs the
  monthly allocation (no more 700% on "All time").
- **Charts**: colorblind-validated cosmic palette; historical chart is a smooth area curve.
- **Currency**: INR display falls back to a cached/last-resort rate instead of "…".
- **AI Analyst**: redesigned (mascot, status pill, cosmic tip, quick-prompt chips); wired to
  Gemini via `GEMINI_API_KEY`.
- **Density pass**: global 15px root + trimmed oversized heroes/values so screens scan in one view.
- **Dev CORS**: any localhost origin accepted in development; strict allowlist in production.
- **Dependencies**: applied all passing Dependabot bumps (React 19.2.4, TypeScript 6.0.2,
  @types/node 25, cors/resend/marked/autoprefixer); held @prisma/client 7 (breaking migration).

### Fixed — Component bugs (branch `fix/component-bugs`)
- **Category drilldown works again** (`CMP-H2`): clicking a main-category bar in Reports opens its subcategory breakdown (the handler read a chart-level field that a bar-click event doesn't have).
- **Pie-chart category hiding is two-way** (`CMP-H7`): a hidden category stays in the legend (struck-through) and can be clicked to restore, instead of disappearing with no way back.
- **Deleted subcategories stay deleted** (`CMP-H3`): deletion state is applied on load regardless of whether the user has custom additions.
- **Category dropdown is keyboard-accessible** (`CMP-H9`): expense/income category options are real buttons (focusable, Enter/Space selects) — verified with Playwright.
- **OTP paste + leak-free resend** (`CMP-M20`): the verification screen accepts a pasted 6-digit code and the resend cooldown no longer leaks a timer on unmount.
- **Calendar cells no longer collapse** (`CMP-M23`): fixed an invalid `min-h-10.5` Tailwind class.

### Fixed — Currency refactor (branch `refactor/currency-context`)
- Currency state, the USD→INR rate fetch, the India default, and persistence moved out of `App.tsx` into a `CurrencyProvider` + `useCurrency()` hook. Verified end-to-end (toggle, persistence, CRUD, tuition).

### Fixed — Phase 1: Critical bug fixes (branch `fixes/phases-1-4`)
- **Tuition tracker no longer loses data** (`CMP-C1`): clicking into and out of the empty tuition field can no longer zero the total or wipe the payment schedule; updating the total now preserves already-paid installments and only redistributes the remaining balance. `1d2fa31`
- **Installment resets and date edits now persist** (`APP-C2`): removed reads of variables mutated inside React state updaters that caused updates to be silently dropped on reload. `1d2fa31`
- **Cent-accurate tuition splits** (`APP-M2`): added a tested `distributeAmount()` helper so paid + unpaid installments always reconcile to the total (no phantom balance). `1d2fa31`
- **Service worker no longer pins users to stale deploys** (`APP-C1`, `APP-M8`): navigation is network-first with a versioned cache; failed asset requests reject instead of returning the HTML shell. `6020dc4`
- **BudgetManagerModal confirms before discarding** unsaved edits on a backdrop/close click (`CMP-M11`). `eabaf0f`
- **CSV import is resilient** (`CMP-M18`): one bad row is skipped and counted instead of aborting the whole file; `reader.onerror` handled; RFC-4180 escaped quotes decoded. `eabaf0f`
- Corrected the `onMarkAsPaid` prop type to match its call site (`CMP-M21`). `1d2fa31`

### Fixed — Phase 2: Security hardening (in progress, branch `fixes/phases-1-4`)
- **Rate limits work behind a proxy** (`SRV-H3`): set `trust proxy` (configurable `TRUST_PROXY`) so login/OTP/AI limiters key off the real client IP instead of collapsing to one global bucket; the per-user limiter now keys off the session cookie. `1ed7ae2`
- **CSRF can no longer silently disable 2FA or log you out** (`SRV-H1`): `/auth/2fa/toggle` and `/auth/logout` are CSRF-protected; disabling 2FA now requires an explicit boolean and the current password. `49e5a06`
- **JWT no longer returned in response bodies** (`SRV-M1`): session/CSRF are cookie-delivered only; unused client token fields removed. `49e5a06`
- **Internal error messages no longer leak to clients** (`SRV-M6`): budget sync, bulk import, and restore return generic 500s. `5d7afd5`
- **Weak-secret guard** (`SRV-L15`): server refuses to boot with a `JWT_SECRET` under 32 chars; `minPasswordLength` aligned to 8. `1ed7ae2`
- **Sessions are invalidated on password reset** (`SRV-M2`): JWTs carry a `tokenVersion` checked per request; resetting the password revokes every previously issued token (including an attacker's). `d45afb1`
- **OTP brute-force lockout** (`SRV-M4`): 5 wrong codes invalidates the active OTP across registration, login-2FA, and password reset. `e3346d6`
- **Audit endpoint locked down** (`SRV-M5`): clients may only report an allowlisted set of actions, namespaced `client:*`, with capped metadata — no more forged audit entries. `995a3be`
- **Google OAuth account-takeover gap closed** (`SRV-M7`): a pre-existing unverified record is verified *and* its password rotated on OAuth login. `995a3be`
- **No plaintext credential dumps** (`SRV-M9`): backups exclude password/OTP/reset-token hashes. `995a3be`
- **Safer build** (`SRV-M10`): `prisma db push` removed from the build (separate `db:push` script); login timing oracle removed and lockout increment made atomic (`SRV-L3/L4`). `995a3be`

> Deploy note: run `npm run db:push` in `server/` once after this update — the schema adds `User.tokenVersion` and `User.otpAttempts`.

### Note — Phase 2 remaining
- Registration email-enumeration (`SRV-L3` registration path) intentionally left as standard UX; revisit if strict anti-enumeration is required.
- Recommended: run a security review over the cumulative Phase 2 diff before merging.

### Fixed — Phase 3: Correctness — money & dates (branch `fixes/phases-1-4`)
- **One date convention** (`X-2`): new `utils/dateUtils.ts` (tested) — calendar days compared as strings, boundaries from local time, never `toISOString()`.
- **Timezone bugs fixed** (`APP-H3/H4`, `CMP-M13/H6`): "this month" and today's transactions now match the user's local day (previously UTC drift hid them for UTC+ users); the 6-month chart no longer duplicates/skips months at month-end; expense/income/tuition date fields default to the local day, not the UTC day.
- **One budget-vs-spend calculation** (`CMP-H4/M15/M14`): new tested `utils/budgetUtils.ts` matcher used everywhere; a subcategory budget now shows real spend, a main-category budget aggregates its subcategories, utilization is always a current-month figure, and alert amounts render in the selected currency. (Previously the same budget showed three different numbers.)
- **Net flow shows its sign** (`CMP-M12`); **FX rate cache hardened** (`APP-M4`, no more `₹NaN` or unhandled parse); **CSV export is RFC-4180 valid** (`APP-M3`, tested); **planning figures relabeled** so labels match the math (`CMP-M22`).

> Deferred: money-as-integer-cents end-to-end (`X-3`/`SRV-M8`) — a larger schema+migration effort scheduled separately; the tuition penny-leak is already fixed via the tested `distributeAmount()` helper.

### Fixed — Phase 4: Architecture (in progress, branch `fixes/phases-1-4`)
- **Status-based auth handling** (`APP-H2`): the API client throws a typed `ApiError` with HTTP status; logout triggers on 401/403 instead of matching error strings.
- **2FA state hydrates on reload** (`APP-H6`): the session is reconciled on every mount.
- **TanStack Query foundation** (`P4a`): provider + configured client added (data-layer migration pending).
- **Server dedupe** (`SRV-L17`): duplicated `normalize*` helpers consolidated into one module.
- **Modal conversion dedup + fix** (`CMP-H5`): `useInrToUsd` hook; a cleared/failed INR field no longer submits a stale USD amount.
- **Undo-delete lifecycle fixed** (`CMP-M19`): `useUndoableDelete` hook clears timers on unmount, times the toast correctly, and keys deletions by id.
- **Cleanup** (`APP-M5`, `APP-L`): removed the stale CDN importmap, the dead `axios` dependency, and unused vite config.

- **Data store migrated to TanStack Query** (`APP-M6`): the four collections and fetch-on-auth logic are now a single `['allData']` query; the hand-rolled 15s cache is gone (React Query keys per query, closing the cross-user cache bug), and logout drops the cached data. Verified end-to-end against a local backend with Playwright (login, CRUD + reload persistence, tuition set/mark-paid/autosave/reload — all pass, zero page errors).

- **Search no longer re-renders the whole app** (`APP-H5`): the raw search input moved into Header and is debounced there; App re-renders only when the debounced term changes.
- **Autosave only when it matters** (`APP-M1`): editing an ordinary expense no longer POSTs the entire semesters array — only tuition-linked edits do.

- **CurrencyContext complete** (PRs #15, #18): all money-displaying components read `displayCurrency`/`conversionRate` from `useCurrency()`; App-level prop-drilling removed.
- **AuthContext** (PR #19): auth state, session reconcile, OAuth redirect, idle timeout, and login/logout/2FA extracted from `App.tsx` into an `AuthProvider`.
- **Transactional semester sync** (`SRV-H2`, PR #20): the reconciliation is atomic and an empty payload can't wipe every semester.
- **Component bug sweep** (PRs #14, #16, #17): category drilldown, two-way pie hiding, persistent subcategory deletions, keyboard-accessible dropdowns, OTP paste, reactive pie sizing, YoY/monthly chart fixes, modal focus traps, missing neo shadows, budget-chart overflow.

### Phase 4 complete
Data-layer migration, search re-render, over-eager autosave, currency + auth contexts, and the transactional semester sync are all done and verified against a real backend. `DashboardLayout` extraction and the generic `TransactionList<T>` DOM dedup were intentionally not pursued (would reintroduce prop-drilling / is cosmetic and will be absorbed by the Phase 6 redesign).

### Planned — Phases 5–6: Modern redesign
- Tokenized, dark-mode-correct design system with reusable primitives (`THM-1`, `THM-2`, `THM-5`).
- Migrate all surfaces from the neo-brutalist look to the modern design, slice by slice.

---

## [4.0.0] — 2026-03 (pre-review baseline)

The state of the app as it entered this review. Summarized from the prior README /
`FEATURE_TRACKER.md`; this project had no changelog before now, so this entry is a
reconstruction rather than a per-commit history.

### Added
- Dedicated AI tab (desktop + mobile) with interactive, account-aware chat, quick-prompt chips, and sanitized markdown rendering.
- USC Bursar tuition tracker with lock-and-redistribute installment logic.
- Multi-currency engine (USD ↔ INR) via the Frankfurter API with persistent preference.
- Reports suite (category, monthly, budget-vs-actual, payment-method, recurring, year-over-year, drilldown) and PDF/CSV/QuickBooks/Xero/Tax exports.
- Financial planning panel (goals, calendar, recurring center, upcoming bills, cash-flow projection, investments, family budgeting).
- Auth stack: cookie-based sessions, CSRF double-submit, optional email 2FA, password policy + strength meter, idle session timeout, Google OAuth.
- PWA (manifest, install prompt, service worker app-shell cache), public landing page and knowledge base, OpenAPI docs endpoint scaffold.
- Observability/security ops: structured request logging, audit logging, env validation, per-user rate limiting, Helmet CSP, Dependabot + dependency-audit workflow.

### Known issues (documented by this review, not yet fixed)
- Data-loss bugs in the tuition tracker and installment persistence.
- Non-functional dark mode; ~915 hardcoded neo-brutalist styling occurrences.
- Timezone and floating-point inconsistencies producing wrong dates/totals.
- Several security gaps (CSRF on auth mutations, rate limits behind proxy, JWT in body).
- No changelog (added now) and smoke-only E2E coverage. (Version control was already in place.)

See [docs/01-codebase-review.md](./docs/01-codebase-review.md) for the full catalog.
