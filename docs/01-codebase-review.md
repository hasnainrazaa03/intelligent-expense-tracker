# Codebase Review — Findings Catalog

**Date:** 2026-07-05
**Scope:** Full-stack review of `client/` (React 19 + Vite + Tailwind 4) and `server/` (Express 5 + Prisma + MongoDB).
**Method:** Four parallel deep reviews — server, client core (`App.tsx`/services/hooks), component layer, and theme/styling — cross-checked against the actual source. Baseline health at review time: `tsc --noEmit` passes on both packages, 6/6 unit tests pass, client production build succeeds.

Each finding has a stable ID so the [roadmap](./02-roadmap.md) can reference it. Severity: **Critical** (data loss / account compromise), **High** (wrong results or exploitable), **Medium** (incorrect behavior in common cases), **Low** (hygiene / edge cases).

---

## 0. Cross-cutting risks (address first)

| ID | Severity | Summary |
|----|----------|---------|
| X-1 | Low | **Version control is present** (git repo cloned from GitHub, full history) but there is no branch-protection/commit discipline documented, no CHANGELOG (now added), and the working tree had uncommitted planning docs. Tag a pre-refactor baseline before the redesign. *(Originally flagged Critical as "no version control" — corrected after verifying the repo lives in the `intelligent-expense-tracker/` subdir.)* |
| X-2 | High | **Timezone convention is undefined.** Dates are interpreted as UTC in some places, local in others, and via `toISOString()` in a third. This is the root cause of APP-H3, APP-H4, CMP-M13, SRV-L (date off-by-one). Pick one convention (recommend: treat all expense dates as timezone-agnostic `YYYY-MM-DD` local calendar days) and apply it everywhere. |
| X-3 | High | **Money stored as `Float`.** Both the DB schema and client math use floating-point. `toFinPrecision` masks but does not eliminate drift. Standardize on integer cents (or Decimal) end-to-end. |
| X-4 | Medium | **Full-state "reconciliation" POST pattern** (budgets, semesters, restore) makes the client authoritative over deletions — the biggest data-loss surface. Move toward item-level CRUD. |

---

## 1. Server (`server/src`)

### Critical / High

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| SRV-H1 | High | `index.ts:101`, `routes/auth.ts:447` | **CSRF can silently disable 2FA.** `/api/auth` is mounted without CSRF protection and `2fa/toggle` derives `enabled` from `req.body \|\| {}`. A cross-site form POST (urlencoded → `req.body` undefined → `enabled=false`) turns off a victim's 2FA with no token and no password confirmation. `logout` is likewise CSRF-able. |
| SRV-H2 | High | `routes/semesters.ts:39-129` | **Semester sync is destructive and non-transactional.** Dozens of sequential creates/updates/deletes with no `$transaction`; a mid-loop failure leaves semesters half-updated. The trailing `deleteMany({ id: { notIn: incomingIds } })` means a client that POSTs a partial/empty array permanently deletes all other semesters and their installments. |
| SRV-H3 | High | `index.ts` (missing), `middleware/rateLimiter.ts` | **`trust proxy` never set.** Behind Render/any reverse proxy, `req.ip` is the proxy address, so `loginLimiter`, `passwordResetLimiter`, and `aiLimiter` become *global* budgets — one attacker's 5 bad logins locks login for the whole site. `userApiLimiter` keys off Bearer only, so cookie traffic is never keyed per-user. |

### Medium

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| SRV-M1 | Medium | `routes/auth.ts:370,425` | JWT returned in JSON body defeats the httpOnly cookie — any XSS can exfiltrate a 7-day credential. |
| SRV-M2 | Medium | `routes/auth.ts:469,515` | No session invalidation on logout or password reset — old 7-day JWTs stay valid up to a week after a compromised password is reset. |
| SRV-M3 | Medium | `routes/expenses.ts:232`, `routes/incomes.ts:144` | `value \|\| undefined` on PUT means optional fields (notes, originalAmount, taxCategory…) can never be cleared — Prisma treats `undefined` as "leave unchanged". |
| SRV-M4 | Medium | `routes/auth.ts:163,391`, `rateLimiter.ts:42` | OTP endpoints brute-forceable: 6-digit codes, 10–15 min validity, no per-account attempt counter, only in-memory per-IP limiter. `reset-password` code check guards account takeover. |
| SRV-M5 | Medium | `routes/data.ts:53-72` | Authenticated audit-log forgery/flooding — caller supplies `action` + arbitrary `metadata` written straight to `logs/audit.log`; can fabricate `login/success` entries and grow disk unboundedly. |
| SRV-M6 | Medium | `routes/budgets.ts:100`, `routes/expenses.ts:380` | Catch blocks return `error.message` for any Error, leaking Prisma internals to clients as misleading 400s. |
| SRV-M7 | Medium | `passport-setup.ts:25-34` | Google OAuth `update: {}` upsert issues sessions for unverified accounts and never sets `isVerified`; a pre-registered email lands the victim on an attacker-seeded record, blocking forgot-password. |
| SRV-M8 | Medium | `schema.prisma:35,61,78,92,105`; `ai.ts:35-51` | Money as `Float` (see X-3). |
| SRV-M9 | Medium | `backup.ts:11,30` | Backup dumps password hashes, hashed OTPs, and reset tokens unencrypted to `server/backups/*.json`. |
| SRV-M10 | Medium | `package.json:8` | `prisma db push` runs in the production build — a build against the wrong `DATABASE_URL` mutates the live schema without migration review. |

### Low (grouped)

- **SRV-L1** CSRF token not bound to session (pure double-submit, non-constant-time compare) — `middleware/csrf.ts:17`.
- **SRV-L2** Bearer clients can never pass CSRF, yet Swagger advertises `bearerAuth` — `index.ts:102`, `swagger.ts:18`.
- **SRV-L3** Registration enumerates verified accounts; login skips bcrypt for unknown users (timing oracle) — `auth.ts:107,253`.
- **SRV-L4** Login lockout counter has a read-modify-write race; should be atomic `{ increment: 1 }` — `auth.ts:290`.
- **SRV-L5** Date off-by-one: `parseValidDate` accepts datetimes/numbers, stored UTC-truncated, echoed via `toISOString().split('T')[0]` — `utils/math.ts:24`, `expenses.ts:147`.
- **SRV-L6** Restore/semester coerce bad numbers to `0` instead of rejecting — `data.ts:157,189,228`, `semesters.ts:41`.
- **SRV-L7** Semester route skips sanitization/status validation; `name` throws on non-string — `semesters.ts:54,98`.
- **SRV-L8** Restore doesn't cap installments per semester (only 1 MB body limit) — `data.ts:222`.
- **SRV-L9** Disallowed CORS origins produce 500s instead of clean blocks — `index.ts:67`.
- **SRV-L10** Google redirect breaks with comma-separated `FRONTEND_URL` — `auth.ts:570,583`.
- **SRV-L11** Missing/mistyped bodies yield 500 instead of 400 (inconsistent `req.body` destructuring) — `expenses.ts:59`, `auth.ts:83`.
- **SRV-L12** `splitShares` silently desyncs from `splitParticipants` (invalid shares filtered, not rejected) — `expenses.ts:46`.
- **SRV-L13** AI: unconfigured service returns 500 (should be 503); no length cap on `message`/`history`; manifest fetches rows it never uses — `ai.ts:68,151`.
- **SRV-L14** No max-amount validation; `parseFloat("12abc") → 12` accepted — `utils/math.ts:16`.
- **SRV-L15** `minPasswordLength: 6` in config vs 8 enforced; no `JWT_SECRET` entropy check — `config.ts:25`, `auth.ts:31`.
- **SRV-L16** In-memory rate limits + file audit log preclude horizontal scaling — `rateLimiter.ts`, `audit.ts:14`.
- **SRV-L17** Dead code: unreachable `budgets.ts:51` filter, unused `ApiError` (`http.ts`), duplicated `normalize*` helpers across 3 route files, empty Swagger spec (no JSDoc in routes), `@types/*` in prod deps, stray `prisma.config.ts.bak`, `seed.ts` unconditionally wipes all collections.

---

## 2. Client core (`App.tsx`, services, hooks, utils)

### Critical

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| APP-C1 | Critical | `public/sw.js:1,20-38` | **Service worker pins users to stale deployments forever.** Cache-first on all same-origin GETs including `/` and `/index.html`, with a hardcoded cache name never versioned by the build. New deploys never reach returning users; an evicted-but-referenced chunk white-screens the route. Cache is unbounded. |
| APP-C2 | Critical | `App.tsx:509-537,744-768` | **Persistence silently skipped by reading vars mutated inside state updaters.** `handleDeleteExpense`/`handleUpdateInstallmentDate` read flags set inside `setSemesters`/`setExpenses` updaters immediately after calling them. Updaters aren't guaranteed synchronous (and run twice in StrictMode). Result: installment-reset and date edits are UI-only and lost on reload. |

### High

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| APP-H1 | High | `App.tsx:444-485` | Side-effect toasts (`checkBudgetAlert`) run inside `setExpenses` updaters — double-fire in StrictMode, can re-toast under concurrent rendering. Compute from the API response after `await`. |
| APP-H2 | High | `App.tsx:253-255` | Auth-failure logout only triggers on exact error strings; misses `'Invalid token payload'`, network errors, reworded messages. User gets stuck on an authenticated shell with empty data. Key off HTTP status instead (currently discarded). |
| APP-H3 | High | `hooks/useDateRangeFilter.ts:17-51` | Range boundaries computed in UTC while expense dates are local `YYYY-MM-DD` → India-based users (app auto-selects INR) don't see today's transactions until mid-morning. |
| APP-H4 | High | `App.tsx:396-397` | Budget-alert month window off by one day in non-UTC zones (`new Date(y,m,1).toISOString()`), so month-boundary expenses count toward the wrong month. |
| APP-H5 | High | `App.tsx:88-89,907-919` | Every keystroke in header search re-renders the whole authenticated app; zero `React.memo` anywhere → visible input lag with a few hundred expenses. |
| APP-H6 | High | `App.tsx:117-128` | `twoFactorEnabled` never hydrated on reload (effect early-returns when already authenticated) → header shows wrong 2FA state and toggle "enables" what's already on. |

### Medium / Low (grouped)

- **APP-M1** Every expense edit marks semesters dirty → full semesters POST even for non-tuition edits — `App.tsx:471,496`.
- **APP-M2** Installment split loses/creates cents (unrounded float; no remainder reconciliation) → phantom outstanding balance — `App.tsx:691,786`.
- **APP-M3** CSV export uses `JSON.stringify` per field → invalid RFC-4180 CSV, arrays dumped as JSON, headers from first row only — `utils/exportUtils.ts:25`.
- **APP-M4** Exchange-rate cache parse unguarded in catch → unhandled rejection / `₹NaN` — `App.tsx:156`, `utils/currencyUtils.ts:20`.
- **APP-M5** Stale CDN importmap (`aistudiocdn.com`) in `index.html:41` — supply-chain hazard, dead weight.
- **APP-M6** 15s GET cache keyed by constant, not session identity; if `logoutUser()` network call fails, next login on same tab can read prior user's cached data — `services/api.ts:13,41`.
- **APP-M7** `Ctrl/Cmd+N` shortcut is browser-reserved — never fires — `App.tsx:284`.
- **APP-M8** SW offline fallback returns HTML for every failed GET (images/fonts/JSON get HTML bodies) — `public/sw.js:36`.
- **APP-L** Dead `axios` dep; dead `fuzzySearch.ts:53` branch; unused `loadEnv`/`@` alias in `vite.config.ts`; leftover `token`/`csrfToken` DTO fields; `InvestmentAccount` localStorage-only; `type Category = string`; `any` casts in `exportUtils.ts`; duplicated update/quick-save handler pairs; duplicate Escape handling; session-timeout timers churn on every mousemove; per-comparison `Date` alloc in sort; UTC export filename; placeholder SEO URLs (`example.com`); smoke-only E2E; per-keystroke localStorage parse in `categorySuggestionService`.

---

## 3. Component layer (`client/src/components`)

### Critical

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| CMP-C1 | Critical | `USCPaymentTracker.tsx:127` + `App.tsx:687` | **Blurring the empty tuition input zeroes the semester and every installment (paid ones included).** `onBlur` fires on any blur; `parseFloat('') → NaN → 0`; parent recomputes all installments to `amount: 0`. Clicking into the field and back out destroys the payment schedule. |

### High

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| CMP-H2 | High | `reports/CategoryDrilldown.tsx:66-109` | Category drilldown click never fires — handler checks `data.activePayload` which doesn't exist on a `<Bar onClick>` event. Feature is dead. |
| CMP-H3 | High | `CategoryManagerModal.tsx:27-73` | Deleted subcategories resurrect on reload when the user has no custom additions (deletion state nested inside `if (custom)`; save effect removes the localStorage key). |
| CMP-H4 | High | `BudgetTracker.tsx:67`, `Dashboard.tsx:76`, `Reports.tsx:36`, `reports/BudgetActualChart.tsx:48` | **Three contradictory budget-vs-spend computations.** Budgets are per-subcategory, but BudgetTracker buckets spend by main category (subcategory budgets read $0), Dashboard alerts match raw category (main-category budgets never alert), Reports compares totals with no matching. Same budget shows 0% / 110% / a third number in three places. |
| CMP-H5 | High | `ExpenseModal.tsx:181-209`, `IncomeModal.tsx:95` | Stale converted USD can be committed: conversion effect only runs when `originalAmount > 0`, and `amount` is `readOnly`; IncomeModal doesn't clear `amount` on conversion failure. |
| CMP-H6 | High | `Dashboard.tsx:182` | 6-month budget chart uses `date.setMonth(now.getMonth()-i)` → overflow on 29th–31st produces duplicate/skipped month labels with mis-attributed totals. |
| CMP-H7 | High | `CategoryPieChart.tsx:36-127` | Pie category hiding is one-way — hidden category leaves the legend and can't be unhidden until *all* others are hidden. |
| CMP-H8 | High | `ExpenseList.tsx:256`, `IncomeList.tsx:237`, `config.ts` | Virtualized lists use a fixed 132px row height for variable-height rows (mobile `flex-col`, inline-edit textarea) → cards overlap/clip; edit renders under the next row. |
| CMP-H9 | High | `ExpenseModal.tsx:455`, `IncomeModal.tsx:271` | Category selection is keyboard-inaccessible: options are `<div onClick>` with no `role/tabIndex/key handler`; keyboard users can never pick a category. Inline quick-edit is mouse-only too. |

### Medium (grouped)

- **CMP-M10** Desktop auth inputs show a permanent stray focus ring (`md:ring-8` unconditioned) — `Auth.tsx:137`.
- **CMP-M11** Inconsistent modals: BudgetManagerModal, CategoryManagerModal, AnalysisModal, forgot-password modal lack focus trap/Escape/dialog role; BudgetManagerModal closes on backdrop click, discarding unsaved edits — `BudgetManagerModal.tsx:127` et al.
- **CMP-M12** Negative NET_FLOW renders positive (`Math.abs`, color-only sign) — `SummaryCard.tsx:24`.
- **CMP-M13** Mixed UTC/local date handling across Reports/Dashboard/modals/planning (see X-2).
- **CMP-M14** Budget alert amounts ignore display currency (raw USD next to formatted figures) — `Dashboard.tsx:230`.
- **CMP-M15** BudgetTracker compares monthly budgets against the dashboard's selected period (ALL_TIME → everything reads CRITICAL) — `Dashboard.tsx:278`.
- **CMP-M16** BudgetActualChart overflows its container and double-renders title/chrome — `Reports.tsx:184`, `reports/BudgetActualChart.tsx:60`.
- **CMP-M17** Entire `reports/` folder uses the abandoned previous theme (`bg-base-100`, `dark:*`, `rounded-2xl`) → unstyled tooltips/cards.
- **CMP-M18** One bad date row aborts the whole CSV import; `reader.onerror` unhandled; escaped quotes unhandled — `ExportModal.tsx:172-240`.
- **CMP-M19** Undo-delete lifecycle holes: timer not cleared on unmount, toast duration equals delete timer, second delete silently no-ops, loading prop never shows — `ExpenseList.tsx:194`, `IncomeList.tsx:173`.
- **CMP-M20** OTP inputs don't support paste; resend `setInterval` leaks on unmount — `VerifyOTP.tsx:72-111`.
- **CMP-M21** USCPaymentTracker prop contract wrong (`onMarkAsPaid` called with 3 args vs 2 declared); `onUpdateDate` never invoked (paid dates uncorrectable); installment-count `defaultValue` keeps stale value across tabs — `USCPaymentTracker.tsx:11,146,213`.
- **CMP-M22** "Net worth"/"forecast" are mislabeled math (this-month net + investments; trailing-30-day net presented as a forecast) — `FinancialPlanningPanel.tsx:70,183`.
- **CMP-M23** Invalid `min-h-10.5` class collapses calendar cells — `FinancialPlanningPanel.tsx:259`.
- **CMP-M24** Custom categories never reach the rest of the app (dropdowns/budgets/charts read the static `CATEGORIES` constant) — `CategoryManagerModal`.
- **CMP-M25** CategoryPieChart reads `window.innerWidth` at render with no resize listener — `CategoryPieChart.tsx:73`.

### Low (grouped)

Inconsistent default category (`Miscellaneous` vs `Other`); dead `col-span` grid classes under a flex parent; `successMsg` not cleared / login form re-submittable mid-2FA / view toggle is `<a href="#">` (`Auth.tsx`); 1s clock interval re-renders the whole header (`Header.tsx:34`); non-standard month string sort breaks in Safari (`MonthlyCategoryChart.tsx:27`); missing `connectNulls` breaks YoY lines; hardcoded "FISCAL_YEAR_2025" over all-time data; dead components (`ThemeToggle`, `CurrencyToggle`); `NaN%` pivot widths; unescaped pivot CSV. **XSS is handled correctly** — both `dangerouslySetInnerHTML` sites sanitize with DOMPurify.

---

## 4. Theme & styling

**Architecture today:** Tailwind v4 consuming a v3-style `tailwind.config.js` via `@config`. Only 4 colors / 2 shadows / 1 font are tokenized; everything else is inlined.

| ID | Severity | Summary |
|----|----------|---------|
| THM-1 | High | **Dark mode is dead.** `useTheme` toggles `.dark` and persists to localStorage, but the config never sets `darkMode: 'class'` and there's no `@custom-variant dark`, so Tailwind v4 keys `dark:` off `prefers-color-scheme`. The toggle changes nothing. Only 14 `dark:` usages exist, all referencing undefined tokens. |
| THM-2 | High | **Undefined utilities silently render nothing.** `shadow-neo-gold` used 16× but never defined → no shadow. `bg-base-100`, `bg-dark-300`, `text-base-content-secondary`, etc. (13 usages in `reports/`) defined nowhere → transparent tooltips/cards. |
| THM-3 | Medium | **Two declared fonts never loaded.** Config `font-loud` = `Archivo Black` and `.ai-markdown` = `Bebas Neue` are never in the Google Fonts link (only Inter + JetBrains Mono) → silent fallback. `.font-loud` is also defined twice (Inter 900 class vs Archivo Black utility) — a same-name collision. |
| THM-4 | Medium | **`.noise-overlay` at `z-index: 9999`** sits above every modal (z-50/100/110); modal layering is ad hoc. |
| THM-5 | Medium | **~915 neo-brutalist styling occurrences** across 34 components (247 border, 254 `font-loud`, 197 `font-black`/`uppercase`, 111 `shadow-neo`, 23 arbitrary `shadow-[…]`, 79 hardcoded hex, 21 inline styles). No shared Button/Card/Input/Modal primitives — every primitive is re-implemented 30+ times. |
| THM-6 | Medium | Contrast failures baked in (`text-[8px]/[9px]` at `opacity-30`, gold focus ring on bone bg); 79 hex literals bypass the theme (Recharts props, toast styles, `constants.ts` category colors, SVG branding using `#FFC72C` ≠ token `#FFCC00`). |

**Top files by neo-brutalist coupling:** Auth (66), App (64), Reports (62), ExportModal (62), USCPaymentTracker (50), FinancialPlanningPanel (49), ExpenseModal (49), BudgetManagerModal (48), Header (45), Dashboard (43).

**Primitives to build (highest ROI first):** Button (30+ verbatim uses), Card/Panel (12+), Modal/Dialog (7 duplicated overlays), Input/Select, Badge/Tag, Tabs/SegmentedControl (the USD/INR control appears 4×), plus EmptyState, Pagination, Skeleton, a Toast theme module, and a **chart theme module** (Recharts props can't consume CSS classes — centralize as JS design tokens).

---

## Summary counts

| Area | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Cross-cutting | 0 | 2 | 1 | 1 |
| Server | 0 | 3 | 10 | 17 |
| Client core | 2 | 6 | 8 | ~18 |
| Components | 1 | 8 | 16 | ~12 |
| Theme | 0 | 2 | 4 | — |

The highest-leverage fixes are the two client criticals (APP-C1 service worker, APP-C2 lost persistence), the tuition-wipe (CMP-C1), the three server highs (CSRF/2FA, destructive semester sync, trust proxy), and picking one timezone + one money representation (X-2, X-3), since those root causes generate a dozen downstream findings.
