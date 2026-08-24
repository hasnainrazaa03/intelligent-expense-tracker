# 🪐 Orbit

**The precision financial engine for international students at USC.**

Most budgeting apps treat *Tuition* as a one-off expense and *International FX* as an afterthought. **Orbit** is different. It’s a high‑performance, full‑stack expense tracker built to handle the unique financial realities of life at the University of Southern California—from massive Bursar installments to the daily **USD ↔ INR** mental gymnastics.

> Orbit is a cosmic-themed rebrand of the app formerly called *USC Ledger* — same USC-focused features (Bursar tuition installments, Fryft, USC Village, meal-plan awareness), new name and a dark, space-inspired interface.

---

> ### ✅ Status: shipped · in active use
> The UI has fully migrated from the neo-brutalist look to the **cosmic-glass "Orbit"**
> design (both light & dark themes) — see [docs/design-direction.md](./docs/design-direction.md).
> Data-integrity, security, and architecture phases are done. As of **2026-08-24** the app is
> running against real multi-account statement data. Remaining work is quality hardening
> (accessibility audit, broader E2E).
>
> ⚠️ **Do not upgrade Prisma past 6.x.** Prisma 7 requires a driver adapter for every
> database and ships none for MongoDB, so `new PrismaClient()` throws at boot. Prisma's own
> guidance is that MongoDB users stay on 6.x. Both `prisma` and `@prisma/client` are pinned.
>
> - **Findings catalog:** [docs/01-codebase-review.md](./docs/01-codebase-review.md)
> - **Phased plan with checklists:** [docs/02-roadmap.md](./docs/02-roadmap.md)
> - **Changelog:** [CHANGELOG.md](./CHANGELOG.md)
> - **Docs index:** [docs/README.md](./docs/README.md)

---

## 🧠 Why Orbit Exists
International students deal with:
- Multi‑installment tuition plans
- Constant foreign exchange conversions
- Category‑heavy budgeting (rent, food, transport, fees)
- Context that generic finance apps simply don’t understand

Orbit is opinionated, precise, and engineered specifically for this environment.

---

## 🛠️ Engineering Challenges (and Solutions)

### 1. The **"Surgical Sync" Reconciliation Engine**
Managing two independent datasets—a **Bursar Installment Tracker** and a **General Expense Ledger**—creates a high risk of data drift.

**The Problem**  
Rapid frontend auto‑save requests can trigger MongoDB write conflicts (`P2034`) when standard atomic transactions are used.

**The Solution**  
A custom reconciliation flow built on:
- **Sequential backend processing**
- **Frontend debouncing (800ms)**

When a tuition payment is edited or deleted, all dependent updates propagate in a controlled, deterministic sequence.

> No deadlocks. No race conditions. No lost pennies.

---

### 2. Eliminating the **"Penny Leak"**
JavaScript floating‑point math is unreliable for financial systems:

```
0.1 + 0.2 !== 0.3
```

**The Solution**  
A **Precision‑First Financial Layer** using:
- Epsilon‑aware rounding (`Number.EPSILON`)
- Fixed‑precision arithmetic

This prevents silent drift (e.g., `$10.10 → 10.08`) and guarantees accuracy across repeated **USD ↔ INR** conversions.

---

### 3. Hierarchical Budgeting Logic
Most apps stop at: **Food**.

Orbit supports **recursive allocation**:
- Global parent budgets (e.g., *Food*)
- Granular sub‑budgets (e.g., *Dining Out*, *USC Village Groceries*)

The UI provides **real‑time aggregate feedback**, showing how sub‑categories impact the health of the parent budget.

---

## 🤖 The "Trojan Playbook" AI Analyst
Powered by **Google Gemini**, the AI layer doesn’t just read numbers—it understands the **USC ecosystem**.

### Capabilities
- **Contextual Auditing**  
  Detects overspending on transport and reminds you about **USC Fryft (Free Lyft) zones**.

- **Meal Plan Analysis**  
  Compares your *Dining Out* behavior against your USC meal plan value to surface savings opportunities.

- **Manifest Optimization**  
  A custom **Condensed Manifest** system compresses thousands of data points into a structured summary, preventing context‑window overflow while preserving analytical fidelity.

---

## 🚀 Feature Overview

### 🆕 Latest Release Notes (August 2026)
**Multi-account support**
- New **`account`** field on expenses and incomes — `paymentMethod` says *how* you paid,
  `account` says *which card or account*, so two cards that are both "Credit Card" stay
  distinct.
- The statement importer reads the account off the statement header and stamps every row
  from that file; it suggests accounts already in use so one card can't end up under two labels.
- New **Spend by account / card** report.

**Statement import hardening**
- CSV can now be read by the same AI parser the PDF path uses, so **credit-card payments and
  internal transfers are excluded** — a bank statement and a card statement can be imported
  back-to-back without double-counting.
- Split **Debit / Credit** column layouts import correctly (they previously imported *zero*
  rows, silently).
- Accounting amount notations parse: `(45.00)`, `45.00-`, `$45.00 DR/CR`.
- Bulk imports are **idempotent** — a retry is a no-op instead of a duplicate batch.
- Duplicate detection is a multiset match, so two genuine identical same-day charges no
  longer mask every future one.

**Charts & lists**
- Chart tooltips are opaque (they were 4.5% opacity in dark mode, so gridlines read through them).
- Fixed **swapped Spent/Budget labels** in the historical-analytics tooltip — it had been
  reporting over-budget months as under.
- Transaction lists keep their pagination and per-page dropdown on **every** date range,
  including *All time*; page sizes now `10 / 25 / 50 / 100 / All`.
- Hiding tuition is global — Reports and Pivot honour it too (the Tuition tab excepted).
- Monthly category flow follows the currency toggle, and its legend toggles categories on/off.

**Toolchain**
- Vite 8 · vitest 4 · TypeScript 7 · pdf-parse 2. Prisma stays on **6.x** (see the note above).

### 🆕 Release Notes (March 2026)
- Dedicated **AI tab** in navigation (desktop + mobile), separate from transaction views.
- Refactored AI from one-shot analysis to **interactive account-aware chat**.
- Added quick-prompt chips and reset flow for faster, focused prompts.
- AI responses now render as sanitized markdown with concise sections for faster reading.
- Production auth session hardening for cross-origin deploys:
  - cookie `SameSite=None` + `Secure` in production
  - normalized multi-origin CORS matching
  - temporary login response token compatibility for staggered deploys
- Replaced external texture asset that caused `noise.svg` 403 with local CSS texture.
- Removed image preload hints that were generating preload warnings.

### 🏦 Multi-Account Statement Import
Orbit is built around the awkward reality that one bank PDF can bundle **several accounts**,
and a credit card arrives as its own separate statement.

- **`account` vs `paymentMethod`** — `paymentMethod` records *how* (Debit Card, ACH, Zelle),
  `account` records *which source* (`Discover`, `USCCU Checking`). Two cards that are both
  "Credit Card" stay distinguishable in lists, search and reports.
- **The importer sets it once per file.** The AI reads the account off the statement header
  and prefills it; every row from that statement inherits it.
- **Card payments are excluded automatically.** A "PAYMENT TO DISCOVER" line on your bank
  statement is a transfer, not spending — the underlying purchases live on the card
  statement. The parser drops those, along with internal transfers between your own
  accounts, so both statements can be imported without double-counting.
- **Statement periods straddle months.** A card statement dated "March" typically runs
  mid-Feb → mid-March, so its rows land in both calendar months. That's correct, not a bug.
- **Reconcile:** a card cycle's purchases should equal the payment on the bank statement
  roughly a month later (you pay in arrears), plus interest and fees.

`server/scripts/backfill-accounts.ts` assigns `account` to rows imported before the field
existed. Dry-run by default; `--apply` to commit. It never overwrites an account already set.

### 🎓 Bursar Management
- Built specifically for USC’s **4‑installment tuition plans**
- **Lock and Redistribute** algorithm:
  - Paid installments are locked
  - Remaining balance is automatically re‑split if the plan changes

### 💱 Multi‑Currency Engine
- Live FX rates via the **Frankfurter API**
- Instant USD ↔ INR toggle
- Persistent currency preference

### 📄 Modular Pagination
- Reusable frontend component
- Configurable page size (10 / 25 / 50 / 100 / All)
- Available on every date range — including *All time*
- Choosing **All** switches to a virtualized scroll for very large lists
- Maintains UI performance even with thousands of transactions

### ⚡ Performance and Loading
- Route-level code splitting with lazy loading
- Lazy-loaded heavy modals and analytics sections
- Section-level skeleton loaders for perceived speed
- Debounced search to reduce expensive filtering during typing
- API request deduplication + short TTL read cache to reduce duplicate network calls
- Additional memoization for frequently re-computed view props and summaries
- Optimized asset delivery with local static assets and reduced external visual dependencies
- Basic offline resilience with service worker app-shell caching

### 🧱 Architecture and Reliability
- Root-level React error boundary with graceful recovery UI
- Shared hooks for reusable filtering and debounce logic
- Strongly typed API client responses for safer frontend integration
- Centralized client and server configuration constants
- OpenAPI docs exposed at `/api/docs` with machine-readable spec at `/api/openapi.json`
- Query-path index optimization for expense/income lookups (`userId + date/category`)
- Stronger backend payload validation for expenses, incomes, and budgets
- Shared reusable confirmation dialog component to reduce duplicated list logic
- Added unit tests for core utility behavior (fuzzy search, currency formatting)

### 🔎 Observability and Security Ops
- Structured request logging with request IDs and latency
- Standardized server error response shape
- Environment validation at server startup (fail-fast)
- Audit logging for sensitive actions (login, delete, import/export, restore)

### ♿ Accessibility
- Improved ARIA labels on high-traffic UI controls
- Better form labeling and error announcements in auth and modal flows
- Focus-visible styling and improved keyboard navigation for vertical tab controls
- Modal focus trap with return-focus behavior on close
- Live-region announcements for loading and modal error/status updates
- Improved mobile-first navigation with dedicated bottom tab navigation
- Expanded floating quick-action menu for faster add/manage workflows
- Contrast refinements for helper/label text in auth and chart empty states

### 🌐 Discoverability
- Robots and sitemap files for crawl strategy (`client/public/robots.txt`, `client/public/sitemap.xml`)
- Structured data (Schema.org `SoftwareApplication`) embedded in app HTML

### 🔐 Security Hardening
- Tightened Helmet Content Security Policy defaults on server responses
- Route-specific auth hardening with stricter OTP and password-reset rate limits
- Per-user authenticated API rate limiting with safe IP fallback
- Password policy hardening (upper/lower/number/symbol) with client-side strength meter
- Request log sanitization to reduce accidental sensitive data exposure
- Client-side import file validation (extension/size/row limits) for safer data ingestion
- Server-side input sanitization for auth and data CRUD/restore endpoints
- Idle session timeout with warning + auto logout on inactivity

### 🧩 UX Improvements
- First-run onboarding panel with guided next actions
- Recurring reminder controls now support snooze (24h) in addition to dismiss/add
- Interactive category pie chart filtering via clickable legend/slices
- Confirmation flows now support undo window before destructive deletes
- Inline quick edit for list rows (double-click amount/title fields) with instant save hooks
- Expense split assistant with participant-based equal-share calculations
- Receipt upload with in-browser OCR extraction to prefill notes and amounts
- Custom tags and metadata fields on expenses and incomes for richer filtering

### 📈 Planning and Forecasting
- Financial planning panel with monthly savings goal progress tracking
- Calendar-style grouped expense timeline for day-level review
- Recurring management center with status snapshots and quick visibility
- Upcoming bills/subscriptions block with due-soon highlighting
- Proactive behavior-based insight cards generated from spending and recurring patterns
- 30-day cash-flow projection based on recent inflow/outflow trends
- One-click budget templates (student, frugal, balanced) for faster setup
- Merchant auto-categorization learning loop from manual category corrections
- Investment account snapshots and net-worth rollups
- Collaborative/family budgeting entries with shared contribution tracking

### 🛡️ Dependency Safety
- Added Dependabot configuration for weekly client/server dependency updates
- Added GitHub Actions dependency audit workflow (`npm audit --audit-level=high`)

### 🔁 Data Portability
- Import / export in **JSON** and **CSV** formats
- Your data is never trapped—backup, migrate, or restore anytime
- Accounting adapter exports for **QuickBooks** and **Xero** CSV schemas
- Tax report mode (`TAX_CSV`) generated from deductible-tagged expenses

### 🔐 Auth and Session Security
- Auth token migrated from localStorage bearer flow to secure cookie-based session
- CSRF protection enforced using double-submit cookie strategy (`x-csrf-token`)
- Optional login 2FA with email verification code and per-user toggle

### 🌍 Public Surface and Testing
- Public landing page (`/`) with SEO-oriented content and focused conversion path
- Public knowledge base (`/knowledge`) with searchable onboarding/security guidance
- Playwright E2E suite scaffold for core flows (`client/tests/e2e/core-flows.spec.ts`)
- Mobile companion path via installable PWA manifest and install prompt

---

## 💻 Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| ORM / DB | Prisma **6.x** + MongoDB Atlas (Prisma 7 does not support MongoDB) |
| Intelligence | Google Gemini 2.5 Flash (falls back to 2.5 Flash-Lite) |
| External APIs | Frankfurter (FX Rates) |

---

## 🏁 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/hasnainrazaa03/intelligent-expense-tracker.git
cd intelligent-expense-tracker
```

### 2. Local MongoDB (replica set required)
Prisma's MongoDB connector needs a **replica set** — a standalone `mongod` will not work.
The quickest local setup:

```bash
docker run -d --name orbit-mongo -p 27018:27017 mongo:7 --replSet rs0 --bind_ip_all
sleep 5
docker exec orbit-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

After the first run, `docker start orbit-mongo` is enough.

### 3. Backend Setup
```bash
cd server
npm install

# Create a .env file with:
# DATABASE_URL="mongodb://localhost:27018/etracker?replicaSet=rs0&directConnection=true"
# GEMINI_API_KEY="your_api_key"
# JWT_SECRET="your_secret"          # >= 32 chars
# FRONTEND_URL="http://localhost:5173"   # recommended for OAuth redirect consistency

npx prisma generate
npx prisma db push      # creates indexes; safe to re-run
npm run dev
```

> **Signing in locally:** registration emails an OTP. Without a mail provider configured,
> verify the account directly:
> ```bash
> docker exec orbit-mongo mongosh etracker --quiet --eval \
>   'db.User.updateOne({email:"you@example.com"},{$set:{isVerified:true}})'
> ```
> Five failed sign-ins lock the account for 15 minutes; clear it by resetting
> `loginAttempts` / `lockUntil` on the user and restarting the server (the per-IP limiter
> is in-memory).

### 4. Frontend Setup
```bash
cd client
npm install
npm run dev
```

Open: **http://localhost:5173** (Vite picks the next free port if 5173 is taken — check its output).

### 5. Build Validation
Run these checks after pulling updates:

```bash
cd server && npx tsc --noEmit
cd ../client && npx tsc --noEmit && npx vitest run && npm run build
```

All should complete without errors.

### 6. Schema changes
This is MongoDB, so there are no migrations — `db push` syncs **indexes** only, and new
optional fields need no backfill to start working:

```bash
cd server
DATABASE_URL="<target url>" npx prisma db push --skip-generate
```

### 7. Deployment Notes (Vercel + Render)
- Vercel (frontend): set Root Directory to `client`, build command `npm run build`, output directory `dist`.
- Render (backend): set Root Directory to `server`, build command `npm install --include=dev && npm run build`, start command `npm run start`.
- Backend now binds to `0.0.0.0` via `HOST` (defaults safely), and uses `PORT` from environment.

**Required production environment (the server fails fast or warns loudly otherwise):**
- `NODE_ENV=production` — **required**. Only in production are session cookies `Secure` + `SameSite=None` and is CORS locked to the strict allowlist. Without it the app runs in an insecure dev posture and logs a `[SECURITY]` warning.
- `TRUST_PROXY` — **must be set explicitly in production** (the server refuses to boot otherwise). Use `TRUST_PROXY=1` behind exactly one reverse proxy (Render/Heroku/nginx) so `req.ip` is the real client and IP rate limits work; use `TRUST_PROXY=false` only if the process is directly exposed. Defaulting to trust would let a client spoof `X-Forwarded-For` and bypass the login/OTP limiters.
- `FRONTEND_URL` — comma-separated allowlist of production origins for CORS.
- Secrets (`DATABASE_URL`, `JWT_SECRET` ≥32 chars, `GEMINI_API_KEY`, `RESEND_API_KEY`) must come from the platform's secret store, not a checked-out `.env`.

**Health probes:** `GET /health` is a cheap liveness check; `GET /health/ready` also pings MongoDB and returns `503` when the DB is unreachable (use it for the load-balancer readiness probe). Audit events are emitted to stdout (captured by the platform log aggregator) in addition to the best-effort local `logs/audit.log`.

---

## 🎨 Design — Cosmic Dark ("Orbit")
The app shipped as *USC Ledger* with a **Neo‑Brutalist** look. It has since migrated to
**Orbit** — a **dark, cosmic "glassmorphism"** interface: an animated starfield,
translucent glass panels, an indigo accent, soft glow, and clean **Sora + Inter**
typography, with a working **light/dark** toggle (dark is the signature theme).

The full token spec and palette (colorblind-validated) live in
**[docs/design-direction.md](./docs/design-direction.md)**. Both themes are complete.
Financial calculations and data schemas were unchanged by the redesign.

One rule worth keeping: `.glass` uses a **translucent** surface, which is right for page
chrome but wrong for anything rendered *over* a chart. Tooltips use `.chart-tooltip`
(opaque `--modal-surface`) so plotted lines don't read through the numbers.

---

## ✌️ Fight On!
Built for Trojans who want control, precision, and financial clarity.

