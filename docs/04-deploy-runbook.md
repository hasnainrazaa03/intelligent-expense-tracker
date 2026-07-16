# Deploy Runbook — Orbit

Step-by-step production deployment. Frontend on **Vercel**, backend on **Render**,
data on **MongoDB Atlas**. Follow top-to-bottom; the DB steps are order-sensitive.

---

## 0. Prerequisites

- A **MongoDB Atlas** cluster (or any MongoDB reachable from Render), connection string ready.
- A **Google Gemini** API key (AI Analyst) and a **Resend** API key + verified sender (emails / OTP).
- A 32+ character random **JWT secret** (`openssl rand -base64 48`).
- The GitHub repo connected to Vercel + Render.

---

## 1. Backend — Render (deploy this FIRST; the frontend needs its URL)

**Service settings**
- Root Directory: `server`
- Build Command: `npm install --include=dev && npm run build`  *(devDeps are needed: `tsc`, `prisma`, and `ts-node` for the one-time migration)*
- Start Command: `npm run start`  *(runs `node dist/src/index.js`)*
- Health Check Path: `/health/ready`  *(pings MongoDB; returns 503 if the DB is unreachable)*

**Environment variables (required — the server fails fast or warns loudly without them):**

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | **Required.** Only in prod are cookies `Secure`+`SameSite=None` and CORS locked to the allowlist. |
| `TRUST_PROXY` | `1` | **Required in prod** (server refuses to boot otherwise). Render puts exactly one proxy in front, so `1`. |
| `DATABASE_URL` | your MongoDB SRV URI | |
| `JWT_SECRET` | 32+ char random string | boot fails if shorter |
| `FRONTEND_URL` | `https://your-app.vercel.app` | comma-separated if multiple origins; drives CORS |
| `GEMINI_API_KEY` | Gemini key | AI Analyst |
| `RESEND_API_KEY` | Resend key | OTP + emailed summary |
| `EMAIL_FROM` | verified sender, e.g. `Orbit <no-reply@yourdomain>` | |

**Optional:** `ENABLE_API_DOCS=true` (exposes `/api/docs` in prod — off by default), `HOST`, `PORT` (Render sets `PORT`).

> On boot the logs print a `[SECURITY] mode=production · secure-cookies=true · cors=strict-allowlist · trust-proxy=1` banner. If it says `mode=development`, `NODE_ENV` isn't set — fix before exposing.

---

## 2. One-time database setup (run once, in this order)

From a shell with the production `DATABASE_URL` (Render Shell, or locally with the prod URI exported). All commands run in `server/`.

```bash
# 2a. Create the new collections + indexes (Household, HouseholdMember, Receipt,
#     the expense householdId index, and any additive User fields). Idempotent.
npm run db:push

# 2b. Back up first (writes server/backups/<timestamp>.json — contains hashes,
#     keep it private; it's gitignored). Skip only on a brand-new empty DB.
npm run db:backup

# 2c. Convert existing Float dollar amounts to integer cents. Idempotent — a
#     marker doc makes a second run a no-op. Harmless (0 rows) on a fresh DB.
npm run db:migrate-cents
```

**Why the order matters:** the app code stores/reads **integer cents**. If the DB
still holds Float dollars when the new code serves traffic, amounts render 100×
too small until 2c runs. On a **fresh** DB there's no existing data, so 2c is a
no-op and order doesn't matter. On an **existing** DB, run 2c before/at cutover.

---

## 3. Frontend — Vercel

**Project settings**
- Root Directory: `client`
- Build Command: `npm run build`
- Output Directory: `dist`

**Environment variable (build-time):**

| Var | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://your-backend.onrender.com/api`  *(the Render URL + `/api`)* |

> This is baked in at build time, so **redeploy the frontend** whenever the backend URL changes. After deploying, set the backend's `FRONTEND_URL` to this Vercel URL and redeploy the backend so CORS allows it.

---

## 4. Post-deploy verification

```bash
curl -s https://your-backend.onrender.com/health          # {"status":"ok",...}
curl -s https://your-backend.onrender.com/health/ready     # {"status":"ready",...} (DB reachable)
curl -s -o /dev/null -w "%{http_code}\n" https://your-backend.onrender.com/api/docs   # 404 in prod (docs gated off)
```

In the app: sign up → verify OTP (confirms Resend), add an expense (confirms
DB + cookies/CSRF), switch the currency picker (confirms the FX fetch), open the
AI Analyst (confirms Gemini). Amounts should read as normal dollars — if they're
100× off, step 2c didn't run.

---

## 5. Ongoing operations

- **Backups:** schedule `npm run db:backup` (or Atlas automated backups). Backup files contain password/OTP hashes — keep them off any public store.
- **Logs:** audit events + `[SECURITY]` banner go to **stdout** (captured by Render logs). The local `logs/audit.log` is best-effort only and wiped on restart.
- **Scaling:** the rate-limiter and audit log are in-memory/stdout, so run a **single** backend instance until they're moved to Redis (`SRV-L16`, tracked in [03-post-launch-plan.md](./03-post-launch-plan.md)). `/health/ready` lets the platform restart a wedged instance.
- **Secrets:** rotate `JWT_SECRET` (invalidates all sessions), `GEMINI_API_KEY`, `RESEND_API_KEY` from the platform store — never commit them.

---

## 6. Rollback

- **Code:** redeploy the previous Git SHA on Render/Vercel.
- **Money migration:** if the cents migration ever needs reverting, restore the
  pre-migration `server/backups/<timestamp>.json` (dollar values) into a clean DB,
  or divide the amount fields by 100 with a reverse script + drop the
  `_migrations` marker. The backup from step 2b is the source of truth.
