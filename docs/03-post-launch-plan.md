# Post-Launch Plan — Remaining Fixes, Hardening & Feature Backlog

Derived from the multi-agent codebase audit run on 2026-07-15 (server security,
client correctness, feature/roadmap synthesis). The Phase 0–7 roadmap in
[02-roadmap.md](./02-roadmap.md) is essentially complete; this document tracks
what remains plus the forward feature backlog, in execution order.

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

### A4. Money-as-integer-cents migration  *(effort: L — its own mini-project)*
- [ ] **X-3 / SRV-M8 / SRV-L5** Convert `Float` amounts to integer cents (or Decimal) across schema + all math to eliminate FX round-trip drift. Foundational; schedule before heavy multi-currency work. Not a blocker for personal-scale launch (display already rounds).

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
3. [ ] **Scheduled/exportable PDF report email (S)** — reuse the existing report renderer + Resend.

### Tier 2 — flagship value
4. [x] **Recurring transactions auto-materialization (S–M)** *(PR #54)* — a recurrence rule + on-login/scheduled job that auto-inserts due transactions with a confirm step. Today `isRecurring` is only a reminder.
5. [x] **Generalize multi-currency beyond USD/INR (M)** *(PR #55)* — the FX engine already supports all currencies; replace the hardcoded USD↔INR toggle with a currency picker. Biggest audience expander.
6. [ ] **Push/email budget & bill alerts (M)** — server email (Resend) + Web Push (SW already present) for 80%/100% budget and bill-due reminders.
7. [x] **Bank-statement CSV import with column mapping (M)** *(PR #57)* — map arbitrary bank exports + auto-categorize.
8. [x] **Savings goals as fundable objects (M)** *(PR #53)* — a `Goal` model with contributions and forecast-projected completion date.

### Tier 3 — larger investments
9. [ ] **Net-worth / investment tracking, persisted (M)** — promote localStorage-only investment snapshots to real accounts + historical net-worth trend.
10. [ ] **Full offline PWA with write queue (M)** — IndexedDB queue + sync-on-reconnect via TanStack Query mutations.
11. [~] **Shared/household accounts (L)** — full invite/roles flow still open, but the **roommate settle-up** first step shipped: who-owes-you balances from existing split shares. *(PR #61)*
12. [ ] **Receipt image storage + gallery (M)** — OCR already extracts text; retain the image blob.

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

Also process-only: **A5** comprehensive keyboard-a11y audit and the
user-triggered **`/security-review`** (cannot be self-run). Bank-import E2E
landed in #58; AI/tuition E2E remain.

**Recommended next:** schedule **A4 (money-as-cents)** as a focused migration —
it's the last substantive correctness item and everything else is either infra-
gated or a larger product build.

---

## Section C — Go-live checklist (deploy config)

- [ ] `NODE_ENV=production` on the backend (enables Secure/SameSite=None cookies + strict CORS).
- [ ] `TRUST_PROXY=1` on Render (one proxy); server refuses to boot in prod without it.
- [ ] `FRONTEND_URL` = deployed origin(s).
- [ ] Rotate + inject secrets via the platform store (`JWT_SECRET` ≥32, `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`).
- [ ] Load-balancer readiness probe → `GET /health/ready`.
- [ ] Run `npm run db:push` once for any additive schema fields.

---

## Execution order

1. **A1 + A2** (correctness/labeling + FX transparency) — quick, safe, no schema. ← start here
2. **B1–B3** (Tier 1 features) — high value, no migration risk.
3. **A3** (custom categories) then **B4/B5** (recurring, multi-currency).
4. **A4** (money-as-cents) as a scheduled mini-project before further money features.
5. **A5/A6 + Tier 3** as scale/maturity demands.
