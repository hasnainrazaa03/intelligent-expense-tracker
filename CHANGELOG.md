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
