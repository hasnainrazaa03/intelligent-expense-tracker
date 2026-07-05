# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work planned in the [roadmap](./docs/02-roadmap.md), tracked against the
[codebase review](./docs/01-codebase-review.md). Nothing below has shipped yet — this
section is the working queue. Move items to a dated release as they land.

### Planned — Phase 1: Critical bug fixes
- Fix tuition input wiping the semester and zeroing paid installments on blur (`CMP-C1`).
- Fix installment reset / date edits silently lost because values were read from inside React state updaters (`APP-C2`).
- Fix the service worker pinning returning users to stale deployments; move to network-first navigation with build-versioned caches (`APP-C1`, `APP-M8`).
- Prevent BudgetManagerModal from discarding unsaved edits on backdrop click (`CMP-M11`).
- Make CSV import skip bad rows instead of aborting the whole file (`CMP-M18`).

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
