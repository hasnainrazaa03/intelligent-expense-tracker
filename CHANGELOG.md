# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work planned in the [roadmap](./docs/02-roadmap.md), tracked against the
[codebase review](./docs/01-codebase-review.md). Items under **Fixed** have landed on the
`fixes/phases-1-4` branch; items under **Planned** are still queued.

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
