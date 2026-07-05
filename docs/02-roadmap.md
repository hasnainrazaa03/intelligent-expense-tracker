# Roadmap — Bug Fixes, Hardening & Modern Redesign

This is the execution plan derived from the [Codebase Review](./01-codebase-review.md). It is organized into phases, each with a checklist and a "Definition of Done" gate. Work top-to-bottom: later phases assume earlier ones landed. Finding IDs (e.g. `APP-C1`) reference the review catalog.

**Guiding rules**
- One phase = one focused branch/PR series. Don't mix bug fixes with the visual redesign.
- Every phase ends with: `tsc --noEmit` clean (both packages), unit tests green, a manual smoke of the affected flow, and a CHANGELOG entry.
- The theme refactor (Phase 6) does **not** start until data-integrity phases (1–4) are done — restyling on top of broken math just makes broken math prettier.

**Phase order & rationale**

| Phase | Theme | Why here |
|-------|-------|----------|
| 0 | Safety net | Can't refactor safely without git + a way to observe behavior |
| 1 | Critical bugs (data loss) | Users are losing data *today* |
| 2 | Security hardening | Exploitable account/data compromise |
| 3 | Correctness (money & dates) | Wrong numbers shown to users; root-cause the timezone/float sprawl |
| 4 | Architecture & maintainability | Makes the redesign tractable |
| 5 | Design system foundation (tokens + primitives) | Prereq for restyle |
| 6 | Feature-surface restyle (neo-brutalist → modern) | The visual refactor |
| 7 | Polish, a11y, testing, launch | Lock in quality |

---

## Phase 0 — Safety Net & Baseline
*Goal: make change reversible and observable. ~0.5 day.*

- [x] **X-1** Repo already under git (cloned from GitHub, full history, root `.gitignore` present). ~~Initialize git~~ — done.
- [ ] Commit the current tree (docs + changelog) and **tag** it `pre-refactor-baseline`.
- [ ] Create a working branch; protect the baseline tag.
- [ ] Confirm both packages build & typecheck from a clean checkout (`server: tsc --noEmit`, `client: tsc --noEmit && npm run build`).
- [ ] Capture baseline screenshots of every major surface (auth, dashboard, lists, each modal, reports, AI, tuition) for later visual diffing.
- [ ] Stand up a local `.env` for server (`DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `FRONTEND_URL`, mailer keys) and confirm the app runs end-to-end locally.
- [ ] Remove obvious repo cruft: `server/prisma.config.ts.bak`, verify `backups/` and `logs/` are gitignored.

**Done when:** repo is under git, a clean checkout runs locally, baseline screenshots exist.

---

## Phase 1 — Critical Bug Fixes (stop data loss)
*Goal: no user action silently loses data. ~1–2 days.*

- [x] **CMP-C1** Tuition input wipe: field now commits on Enter / valid blur, ignores `NaN`/empty blur, and `handleUpdateSemesterTuition` rejects non-finite/negative totals **and preserves paid installments** (only redistributes the remaining balance). *(commit `1d2fa31`)*
- [x] **APP-C2** `handleDeleteExpense` and `handleUpdateInstallmentDate` now compute needed values from current state *before* `setState`, so installment resets and date edits persist reliably. *(commit `1d2fa31`)*
- [x] **APP-M2** Added cent-accurate `distributeAmount()` (with unit tests) used for all tuition splits so paid+unpaid reconciles to the total. *(commit `1d2fa31`)*
- [x] **CMP-M21** Corrected `onMarkAsPaid` prop type to match its 3-arg call site. *(commit `1d2fa31`)*
- [x] **APP-C1 / APP-M8** Service worker rewritten:
  - [x] Navigation requests are **network-first** (cached shell only offline).
  - [x] Cache versioned (`v2`); old caches purged on `activate`; `skipWaiting` + `clients.claim` so deploys reach users.
  - [x] Failed non-navigation GETs reject instead of receiving the HTML shell; cross-origin requests bypass the SW. *(commit `6020dc4`)*
  - [ ] *(Deferred to Phase 7)* Explicit update-available toast/banner (current skip-waiting behavior already unblocks deploys).
- [x] **CMP-M11** BudgetManagerModal confirms before discarding unsaved edits on backdrop/[X] click (dirty-flag guard). *(commit `eabaf0f`)*
- [x] **CMP-M18** CSV import isolates each row (one bad date no longer aborts the file), skips+counts invalid rows, handles `reader.onerror`, and decodes RFC-4180 escaped quotes. *(commit `eabaf0f`)*

**Done when:** you can (1) click into and out of the tuition field without losing the schedule, (2) delete a tuition expense and reload with the installment correctly reset, (3) redeploy and have a returning user get the new build, all verified manually. — **Code complete; recommend a manual smoke of the tuition + deploy flows before closing.**

---

## Phase 2 — Security Hardening
*Goal: close exploitable holes. ~2–3 days.*

- [x] **SRV-H1** CSRF protection applied to `/auth/2fa/toggle` and `/auth/logout`; `2fa/toggle` requires an explicit boolean and the current password to disable. *(commit `49e5a06`)*
- [x] **SRV-H3** `trust proxy` set (configurable `TRUST_PROXY`, default 1); `userApiLimiter` keys off the session cookie with IP fallback. *(commit `1ed7ae2`)*
- [x] **SRV-M1** JWT (and redundant csrfToken) removed from login/2FA response bodies; client DTO cleaned up. *(commit `49e5a06`)*
- [x] **SRV-M2** Session invalidation on password reset via a `tokenVersion` claim checked in `authMiddleware` (one indexed lookup per authenticated request); reset bumps the version. *(commit `d45afb1`)*
- [x] **SRV-M4** Per-account failed-OTP counter (`otpAttempts`) invalidates the active code after 5 wrong guesses across register / login-2FA / password-reset. *(commit `e3346d6`)*
- [x] **SRV-M5** `POST /api/data/audit` restricted to an allowlist, namespaced `client:*` (no forged server events), metadata capped/sanitized. *(commit `995a3be`)*
- [x] **SRV-M6** Generic 500s for budget sync / bulk import / restore; no `error.message` echoed to clients. *(commit `5d7afd5`)*
- [x] **SRV-M7** Google OAuth verifies + rotates the password on a pre-existing *unverified* record; verified accounts untouched. *(commit `995a3be`)*
- [x] **SRV-M9** `backup.ts` no longer dumps password/OTP/reset-token hashes to plaintext. *(commit `995a3be`)*
- [x] **SRV-M10** Removed `prisma db push` from the build; added a separate `db:push` script. *(commit `995a3be`)*
- [x] **SRV-L15** `JWT_SECRET` ≥32-char check at boot; `minPasswordLength` aligned to 8. *(commit `1ed7ae2`)*
- [x] **SRV-L4** Atomic lockout increment (no race undercount). *(commit `995a3be`)*
- [x] **SRV-L3 (login)** Dummy bcrypt compare removes the login user-enumeration timing oracle. *(commit `995a3be`)*
- [ ] **SRV-L3 (registration)** *Accepted/deferred:* registration still tells a user their email is already taken (standard UX). Full anti-enumeration (generic 201 + "account exists" email) is a UX tradeoff to revisit if needed.
- [ ] Run `/security-review` on the cumulative diff before merge. *(Recommended next.)*

**Done when:** a cross-site form can't toggle 2FA ✅, rate limits work behind the proxy ✅, no JWT appears in any response body ✅, and a password reset invalidates old sessions ✅. — **Phase 2 code complete (only the deploy `db:push` note + a security-review pass remain).**

> **Deploy note:** the build no longer runs `prisma db push`. After pulling schema changes (this phase adds `User.tokenVersion` and `User.otpAttempts`), run `npm run db:push` in `server/` once against the target database. On MongoDB these are additive optional fields with defaults, so existing documents keep working.

---

## Phase 3 — Correctness: Money & Dates
*Goal: the numbers on screen are right everywhere. ~3–4 days.*

**Conventions (X-2, X-3):**
- [x] **X-2** Date convention chosen and implemented: `client/src/utils/dateUtils.ts` — dates are timezone-agnostic `YYYY-MM-DD` calendar days compared as strings, boundaries from LOCAL time, never `toISOString()`. Tested. *(commit `df96672`)*
- [ ] **X-3 / SRV-M8** Money-as-integer-cents end-to-end. ⚠️ *Deferred:* large, risky change (DB schema + migration + all math). The tuition penny-leak is already mitigated by the tested `distributeAmount()` cents helper (Phase 1) and `formatCurrency` rounds display. Recommend scheduling as its own mini-project after Phase 4, not inside this pass.

**Applied:**
- [x] **APP-H3 / APP-H4 / CMP-M13** `useDateRangeFilter`, budget-alert window, Dashboard, modals, tuition tracker, ExportModal range + filenames, Reports/Pivot filenames, FinancialPlanningPanel all use the shared calendar helpers. *(commits `df96672`, `1691a70`, `899cc52`)*
- [x] **CMP-H6** 6-month window uses overflow-safe `addMonths` + month-key matching. *(commit `1691a70`)*
- [x] **CMP-H4** One shared `budgetUtils` matcher (tested) used by BudgetTracker, Dashboard alerts, App toast, Reports utilization, and BudgetActualChart. *(commit `2584b11`)*
- [x] **CMP-M15** Budget utilization is always a current-month figure regardless of the dashboard's period. *(commit `2584b11`)*
- [x] **CMP-M14** Budget alert amounts render through `formatCurrency`. *(commit `2584b11`)*
- [x] **CMP-M12** NET_FLOW shows a leading minus sign, not color only. *(commit `addc814`)*
- [x] **APP-M2** Installment split reconciles remainder cents (Phase 1, `distributeAmount`). *(commit `1d2fa31`)*
- [x] **APP-M3** CSV export uses an RFC-4180 encoder (tested). *(commit `b001816`)*
- [x] **APP-M4** FX rate cache parse guarded; never yields `₹NaN`. *(commit `addc814`)*
- [x] **CMP-M22** "Net worth"/"forecast" relabeled so the label matches the math. *(commit `899cc52`)*
- [ ] **SRV-L5** Server-side calendar-day parse normalization — bundle with the X-3 money/cents migration (server-side).

**Done when:** the same budget shows the same utilization in all four places ✅; a US-evening and an India-morning entry both land on the correct day ✅; CSV export is valid ✅. — **Phase 3 client correctness complete; only the X-3/SRV-M8/SRV-L5 money-as-cents migration is deferred as a separate scheduled effort.**

---

## Phase 4 — Architecture & Maintainability
*Goal: make the codebase safe to restyle and extend. ~4–6 days.*

- [ ] **APP (App.tsx is 1,265 lines)** Decompose the monolith:
  - [ ] `AuthContext` — auth state, session timeout, 2FA (fixes **APP-H2** via status-based handling and **APP-H6** hydration).
  - [ ] `CurrencyContext` — replaces prop-drilling `displayCurrency`/`conversionRate` through 25+ interfaces.
  - [ ] Data hooks `useExpenses`/`useIncomes`/`useBudgets`/`useSemesters` (or adopt React Query, which also replaces the hand-rolled 15s cache and refetch logic — fixes **APP-M6** cache-keying and **APP-M1** over-eager semesters saves).
  - [ ] A `DashboardLayout` route component owning nav/FAB/modals.
- [ ] **APP-H2** Make `fetchApi` surface HTTP status; drive logout off 401/403, not error strings.
- [ ] **APP-H5** Add `React.memo` to list/chart/row components and `useCallback` to handlers so search keystrokes don't re-render the world.
- [ ] **CMP code quality** Extract a generic `TransactionList<T>` (kills ~250 lines of ExpenseList/IncomeList duplication and fixes undo lifecycle **CMP-M19** once) and a `useInrToUsd` conversion hook (dedupes ExpenseModal/IncomeModal, fixes **CMP-H5**).
- [ ] **SRV-X4 / SRV-H2 follow-up** Convert the destructive full-state reconciliation routes (semesters especially) to item-level CRUD or wrap them in `$transaction` with validation-first (also closes **SRV-L6/L7/L8**).
- [ ] **SRV-L17** De-duplicate the `normalize*` helpers into a shared module; delete dead code (`ApiError`, unreachable filters); populate or remove the empty Swagger spec.
- [ ] **APP-M5 / APP-L** Remove the stale CDN importmap, dead `axios`, unused vite `loadEnv`/alias.
- [ ] **CMP-M24** Make custom categories actually propagate (single source of truth for categories, not a static constant + localStorage side channel).

**Done when:** `App.tsx` is under ~300 lines, no component re-renders on unrelated search keystrokes, and there is one `TransactionList` and one currency-conversion hook.

---

## Phase 5 — Design System Foundation (tokens + primitives)
*Goal: a modern, tokenized theme layer with no visual regressions yet. ~3–4 days. Supersedes the token portions of `UI_REFACTOR_MASTER_PLAN.md`.*

- [ ] **THM-1** Wire dark mode correctly for Tailwind v4: add `@custom-variant dark (&:where(.dark, .dark *))` (or `darkMode: 'class'`), so the existing `useTheme` toggle actually works.
- [ ] Define **semantic design tokens** as CSS variables with `.dark` overrides: `--color-bg`, `--surface`, `--border`, `--primary`, `--accent`, `--success`, `--warning`, `--danger`, `--muted-foreground`; a radius scale (move off square-everything); an **elevation scale** to replace hard neo-brutalist shadows; a spacing/type scale that kills the `text-[8px]/[9px]/[10px]` sprawl.
- [ ] **THM-3** Load the fonts you actually use; remove references to unloaded `Archivo Black`/`Bebas Neue`; resolve the `.font-loud` double-definition collision. Choose the modern type pairing here (see Phase 6 direction note).
- [ ] **THM-2** Define or delete the orphan utilities: `shadow-neo-gold` and all `bg-base-*/dark-*/text-base-*` tokens used by `reports/`.
- [ ] **THM-6** Build a **chart theme module** (JS tokens for Recharts axis/stroke/tooltip/fill) and rebuild `constants.ts` `CATEGORY_COLORS` as an accessible, collision-free palette. See the `dataviz` skill for palette construction.
- [ ] Build the **primitive library** (each with hover / focus-visible / disabled / loading / error states, correct ARIA):
  - [ ] `Button` (primary / secondary / destructive / icon; sizes) — replaces 30+ verbatim uses.
  - [ ] `Card` / `Panel` / `StatCard`.
  - [ ] `Modal`/`Dialog` (one overlay, folds in `useModalFocusTrap`, fixes z-index sprawl **THM-4** and **CMP-M11**).
  - [ ] `Input` / `Select` / `SearchableSelect` (keyboard-accessible — fixes **CMP-H9**) / `OtpInput` (with paste — **CMP-M20**).
  - [ ] `Badge`/`Tag`, `Tabs`/`SegmentedControl` (one USD/INR control), `EmptyState`, `Pagination`, `Skeleton`, `Toast` theme.
- [ ] **THM-4** Fix layering: drop `.noise-overlay` below modals (or remove it for the modern look); standardize a z-index scale.

**Done when:** the token layer + primitives exist and render, the dark-mode toggle visibly works, but feature screens still look essentially the same (primitives styled to match current look as a checkpoint).

---

## Phase 6 — Feature-Surface Restyle (Neo-Brutalist → Modern)
*Goal: migrate every surface to the modern design, slice by slice. ~7–10 days.*

Migrate one slice at a time; after each, compare against Phase 0 baseline screenshots and run the affected flow.

- [ ] Decide/lock the target visual direction (see note below) and record it in `docs/design-direction.md`.
- [ ] Slice 1: **Auth + onboarding** (Auth, VerifyOTP, forgot-password) — highest coupling (66/54).
- [ ] Slice 2: **Navigation + layout shell** (Header, sidebar/bottom nav, FAB) — App-level chrome.
- [ ] Slice 3: **Expense/Income lists + forms** (the new `TransactionList`, ExpenseModal, IncomeModal).
- [ ] Slice 4: **Dashboard + charts** (Dashboard, SummaryCard, all chart components via the chart theme module).
- [ ] Slice 5: **Reports + export** (Reports, ExportModal, `reports/*` — retheme the abandoned `base-*` files **CMP-M17/CMP-M16**).
- [ ] Slice 6: **AI tab/chat** (AiAnalyst, AnalysisModal — fix `.ai-markdown` font).
- [ ] Slice 7: **USC tuition module** (USCPaymentTracker — also lands **CMP-M21** prop-contract fix).
- [ ] Slice 8: **Planning** (FinancialPlanningPanel — fix **CMP-M23** invalid class during restyle).
- [ ] Remove the last hardcoded neo-brutalist class stacks and hex literals (target: 0 arbitrary `shadow-[…#hex…]`, 0 raw hex in `.tsx`).
- [ ] Retire dead theme code (`ThemeToggle`/`CurrencyToggle` if still unused, `tailwind.config.js` once fully on `@theme`).

**Done when:** every surface uses primitives + tokens, `grep -rn "border-4 border-black\|shadow-\[.*#" src` returns ~0, and both light and dark render correctly.

> **Visual direction:** you mentioned providing good samples — drop them in and I'll turn them into the token values (color ramps, radius, elevation, type scale) and a `design-direction.md`. Default recommendation if you don't: a clean, calm fintech look — neutral surface with one confident accent, soft elevation, generous radius (8–12px), a humanist sans (e.g. Inter/General Sans) at a proper type scale, WCAG-AA contrast, and USC cardinal reserved as a single accent rather than a dominant field.

---

## Phase 7 — Polish, Accessibility, Testing & Launch
*Goal: lock in quality. ~2–3 days.*

- [ ] Micro-interactions/motion pass (transitions, skeletons, state changes) with `prefers-reduced-motion` respected.
- [ ] Full accessibility pass: keyboard-only nav of every flow, focus order, contrast audit (both themes), ARIA/live-region checks. Confirm **CMP-H9/M20/M11/M12** are truly fixed.
- [ ] Performance: verify Phase 4 memoization holds; re-check bundle (lazy-load the heavy `jspdf-autotable` 398 kB / recharts / html2canvas / tesseract paths).
- [ ] Testing: expand the smoke-only E2E (auth, CRUD, import/restore, reports, AI chat, tuition); add unit tests for the new shared money/date/budget utilities.
- [ ] Responsive QA at key breakpoints; fix the fixed-row-height virtualization properly (**CMP-H8**) with measured/estimated sizes.
- [ ] Update README, CHANGELOG, and `FEATURE_TRACKER.md`; write a final migration summary with known follow-ups.
- [ ] Run `/code-review high` and `/security-review` on the cumulative diff.

**Done when:** all critical/high findings are closed, E2E covers the core journeys, both themes pass a contrast audit, and docs reflect reality.

---

## Progress tracking

Check items off in place as they land. Keep a one-line entry per shipped item in [CHANGELOG.md](../CHANGELOG.md). The severity rollup lives in the [review catalog](./01-codebase-review.md#summary-counts); update it as counts drop.
