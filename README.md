# ⚔️ USC Ledger v4.0

**The precision financial engine for international students at USC.**

Most budgeting apps treat *Tuition* as a one-off expense and *International FX* as an afterthought. **USC Ledger** is different. It’s a high‑performance, full‑stack manifest built to handle the unique financial realities of life at the University of Southern California—from massive Bursar installments to the daily **USD ↔ INR** mental gymnastics.

---

## 🧠 Why USC Ledger Exists
International students deal with:
- Multi‑installment tuition plans
- Constant foreign exchange conversions
- Category‑heavy budgeting (rent, food, transport, fees)
- Context that generic finance apps simply don’t understand

USC Ledger is opinionated, precise, and engineered specifically for this environment.

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

USC Ledger supports **recursive allocation**:
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
- Configurable page size (10 / 25 / 50)
- Auto-virtualized rendering for very large lists
- Maintains UI performance even with thousands of transactions

### ⚡ Performance and Loading
- Route-level code splitting with lazy loading
- Lazy-loaded heavy modals and analytics sections
- Section-level skeleton loaders for perceived speed
- Debounced search to reduce expensive filtering during typing
- API request deduplication + short TTL read cache to reduce duplicate network calls
- Additional memoization for frequently re-computed view props and summaries
- Optimized asset delivery with image preload hints for critical USC branding assets
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

### 🛡️ Dependency Safety
- Added Dependabot configuration for weekly client/server dependency updates
- Added GitHub Actions dependency audit workflow (`npm audit --audit-level=high`)

### 🔁 Data Portability
- Import / export in **JSON** and **CSV** formats
- Your data is never trapped—backup, migrate, or restore anytime

---

## 💻 Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| ORM / DB | Prisma + MongoDB Atlas |
| Intelligence | Google Gemini 1.5 Flash |
| External APIs | Frankfurter (FX Rates) |

---

## 🏁 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/your-username/usc-ledger.git
cd usc-ledger
```

### 2. Backend Setup
```bash
cd server
npm install

# Create a .env file with:
# DATABASE_URL="your_mongodb_uri"
# GEMINI_API_KEY="your_api_key"
# JWT_SECRET="your_secret"
# FRONTEND_URL="http://localhost:5173"   # recommended for OAuth redirect consistency

npx prisma generate
npm run dev
```

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```

Open: **http://localhost:5173**

### 4. Build Validation
Run these checks after pulling updates:

```bash
cd server && npx tsc --noEmit
cd ../client && npx tsc --noEmit
```

Both should complete without TypeScript errors.

---

## 🎨 Design Philosophy
USC Ledger uses a **Neo‑Brutalist aesthetic**:
- High contrast
- Heavy borders
- Zero‑nonsense typography

It’s built to be **loud**, **fast**, and deeply **cynical about floating‑point math**.

---

## ✌️ Fight On!
Built for Trojans who want control, precision, and financial clarity.

