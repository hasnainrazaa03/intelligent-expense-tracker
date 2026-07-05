# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work planned in the [roadmap](./docs/02-roadmap.md), tracked against the
[codebase review](./docs/01-codebase-review.md). Items under **Fixed** have landed on the
`fixes/phases-1-4` branch; items under **Planned** are still queued.

### Fixed — Phase 1: Critical bug fixes (branch `fixes/phases-1-4`)
- **Tuition tracker no longer loses data** (`CMP-C1`): clicking into and out of the empty tuition field can no longer zero the total or wipe the payment schedule; updating the total now preserves already-paid installments and only redistributes the remaining balance. `1d2fa31`
- **Installment resets and date edits now persist** (`APP-C2`): removed reads of variables mutated inside React state updaters that caused updates to be silently dropped on reload. `1d2fa31`
- **Cent-accurate tuition splits** (`APP-M2`): added a tested `distributeAmount()` helper so paid + unpaid installments always reconcile to the total (no phantom balance). `1d2fa31`
- **Service worker no longer pins users to stale deploys** (`APP-C1`, `APP-M8`): navigation is network-first with a versioned cache; failed asset requests reject instead of returning the HTML shell. `6020dc4`
- **BudgetManagerModal confirms before discarding** unsaved edits on a backdrop/close click (`CMP-M11`). `eabaf0f`
- **CSV import is resilient** (`CMP-M18`): one bad row is skipped and counted instead of aborting the whole file; `reader.onerror` handled; RFC-4180 escaped quotes decoded. `eabaf0f`
- Corrected the `onMarkAsPaid` prop type to match its call site (`CMP-M21`). `1d2fa31`

### Planned — Phase 2: Security hardening
- CSRF-protect `/api/auth` mutations; require password to disable 2FA (`SRV-H1`).
- Set `trust proxy` so rate limits work behind the deployment proxy; key per-user limiter off the session (`SRV-H3`).
- Stop returning the JWT in response bodies; rely on the httpOnly cookie (`SRV-M1`).
- Invalidate sessions on password reset (`SRV-M2`).
- Per-account OTP attempt lockout; lock down client-writable audit log; stop leaking internal error messages (`SRV-M4`, `SRV-M5`, `SRV-M6`).

### Planned — Phase 3: Correctness (money & dates)
- Single date convention across the app; fix timezone bugs hiding "today" for non-UTC users (`X-2`, `APP-H3`, `APP-H4`, `CMP-M13`, `CMP-H6`).
- One shared budget-vs-spend calculation used everywhere (`CMP-H4`, `CMP-M15`).
- Integer-cents money representation end-to-end; RFC-4180 CSV export (`X-3`, `APP-M3`).

### Planned — Phase 4: Architecture
- Decompose the 1,265-line `App.tsx` into auth/currency contexts and data hooks.
- Extract a shared `TransactionList` and currency-conversion hook.
- Status-based auth handling; memoization to stop app-wide re-renders on search.

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
