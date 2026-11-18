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
| `TRUST_PROXY` | `2` | **Required in prod** (server refuses to boot otherwise). Requests arrive through Vercel's `/api` rewrite and then Render's proxy: two hops, so `2`. (Use `1` only if the frontend calls Render directly.) |
| `DATABASE_URL` | your MongoDB SRV URI | |
| `JWT_SECRET` | 32+ char random string | boot fails if shorter |
| `FRONTEND_URL` | `https://your-app.vercel.app` | comma-separated if multiple origins; drives CORS |
| `GEMINI_API_KEY` | Gemini key | AI Analyst |
| `RESEND_API_KEY` | Resend key | Sign-up and sign-in codes, password resets, summaries, the "password changed" notice. Without it the API still starts, with email off (it used to crash at boot). |
| `EMAIL_FROM` | verified sender, e.g. `Orbit <no-reply@yourdomain>` | |

**Optional:** `ENABLE_API_DOCS=true` (exposes `/api/docs` in prod — off by default), `HOST`, `PORT` (Render sets `PORT`).

> On boot the logs print a `[SECURITY] mode=production · secure-cookies=true · cors=strict-allowlist · trust-proxy=1` banner. If it says `mode=development`, `NODE_ENV` isn't set — fix before exposing.

---

## 2. One-time database setup (run once, in this order)

From a shell with the production `DATABASE_URL` (Render Shell, or locally with the prod URI exported). All commands run in `server/`.

```bash
# 2a. Create the new collections + indexes (Household, HouseholdMember, Receipt,
#     RevokedToken (logout revocation), UserSettings (one per user, unique
#     userId), the expense householdId index, and any additive User fields).
#     Idempotent — re-run it after any schema change.
npm run db:push

# 2b. Back up first. Writes an encrypted server/backups/orbit-db-<time>.enc.json
#     (gitignored); keep the passphrase in a password manager, the file is
#     useless without it. Skip only on a brand-new empty DB.
read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE   # at least 12 characters
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
| `VITE_API_BASE_URL` | `/api`  *(same-origin: `client/vercel.json` rewrites `/api/*` to Render, so the session cookie is first-party — Safari/iOS block it cross-site)* |

> This is baked in at build time, so **redeploy the frontend** whenever the backend URL changes. After deploying, set the backend's `FRONTEND_URL` to this Vercel URL and redeploy the backend so CORS allows it.

---

### Same-site API (Safari/iOS sign-in)

`client/vercel.json` proxies `/api/*` to the Render service and sets the security
headers (CSP and friends). With `VITE_API_BASE_URL=/api` the browser only ever
talks to the Vercel domain, so session cookies are first-party; cross-site
(`*.vercel.app` → `*.onrender.com`) they are blocked by Safari, iOS browsers and
strict privacy modes.

- Render: `TRUST_PROXY=2` (Vercel + Render's proxy) and
  `GOOGLE_CALLBACK_URL=https://<your-vercel-domain>/api/auth/google/callback`.
- Google Cloud Console → the OAuth client → **Authorized redirect URIs**: add the
  same callback URL (keep the old one until the switch is done).
- If the Render URL changes, update the rewrite destination and `connect-src` in
  `client/vercel.json`.
- The inline theme script in `client/index.html` is allowed by its sha256 in the
  CSP; `securityHeaders.test.ts` fails if they drift.

### Push notifications (budget alerts, bill reminders, monthly summary)

Off until these are set. Do it once:

1. Make a VAPID key pair (in `server/`): `npx web-push generate-vapid-keys`.
2. On **Render**, add:

   | Var | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the public key from step 1 |
   | `VAPID_PRIVATE_KEY` | the private key from step 1 (keep it secret) |
   | `VAPID_SUBJECT` | optional: `mailto:` contact for push services (default: the contact in the privacy policy) |
   | `CRON_SECRET` | a random string of 24+ characters: `openssl rand -hex 32` |

3. On **GitHub** → the repository → Settings → Secrets and variables → Actions, add the
   **secret** `CRON_SECRET` with the same value. The hourly **Notifications** workflow
   calls `POST /api/jobs/notify` with it (and wakes Render). If the API isn't at
   `https://orbit-api-elbw.onrender.com`, also add the **variable** `API_URL`.
4. Run the workflow once by hand (Actions → Notifications → Run workflow). The log
   should show `{"users":…,"configured":true}`.

Changing the VAPID keys later invalidates every browser's subscription: users turn
notifications on again in Settings.

**By email.** The same job also emails the notices to users who turn on Settings →
Notifications → By email. It needs `RESEND_API_KEY` and `EMAIL_FROM`; without them the
switch says email isn't set up. While `EMAIL_FROM` is Resend's test sender
(`onboarding@resend.dev`), Resend only delivers to its account owner's address, so for
everyone else this waits on a verified domain (5a). Each notice is claimed once and goes
out by every channel the user has on; if none of them gets through (Resend down or
rate-limiting), the claim is released and the next hourly run tries again (`retryLater`
in the job's output). Sends are spaced 600 ms apart for Resend's 2-per-second limit
(`EMAIL_SEND_INTERVAL_MS`), and a run that finds another in progress is skipped. Every
alert email has a one-click unsubscribe link and `List-Unsubscribe` headers
(`/api/email-alerts/unsubscribe`, a signed token that only turns email alerts off).
Push and email work independently: either one being set up is enough for the job to run
(`{"configured":true,"push":…,"email":…}`).

### Shared rate limits (Render Key Value)

Rate limits, failed-login lockouts and the daily AI budget are counted in Redis when
`REDIS_URL` is set, so a restart (Render's free plan sleeps) doesn't reset them and
several API instances would share them. Without it they're counted in memory, as before.

1. On **Render** → New → **Key Value**: the **same region** as the API, plan Free.
   Free instances don't save to disk; a Key Value restart only resets the counters.
2. Copy its **Internal Key Value URL** (`redis://red-…:6379`) and add it to the API
   service as `REDIS_URL`. The internal URL only works inside Render, so it needs no
   password or IP allow-list.
3. After the redeploy the log shows `[shared-state] Redis ready (…)`, and
   `GET /health/ready` returns `"counters":"redis"`.

If Redis goes down, nothing breaks: the API switches to in-memory counters at once
(commands time out after 300 ms), logs it at most once a minute, and switches back
when Redis returns. `/health/ready` then says `"counters":"memory (Redis unavailable)"`.

### Visit counts (Vercel Web Analytics)

1. On **Vercel** → the project → **Analytics** → enable **Web Analytics** (free on
   Hobby, up to a monthly event limit).
2. Redeploy: Vercel adds the `/_vercel/insights/*` routes on the next deployment.
3. Visits then appear in the Analytics tab. The client loads Vercel's script only on
   the production hosts (`ANALYTICS_HOSTS` in `client/src/utils/analytics.ts`:
   `www.orbitexpense.me`, `orbitexpense.me` and the old `orbit-expense-tracker.vercel.app`),
   sends the path without its query or fragment, and stays off when the browser sends
   Global Privacy Control or Do Not Track, or the user turns it off in Settings.

### Own domain (orbitexpense.me)

Registered at Namecheap (free first year from the GitHub Student Developer Pack; renews
in November 2027 at Namecheap's normal price, so check Auto-Renew in the Domain List).
DNS stays at Namecheap (Advanced DNS):

| Type | Host | Value | For |
|---|---|---|---|
| A | `@` | `76.76.21.21` | Vercel (the site) |
| CNAME | `www` | `cname.vercel-dns.com` | Vercel |
| MX, TXT | `send`, `resend._domainkey` (as Resend lists them) | from Resend → Domains | sending email |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | spam filters |

Namecheap's student setup starts with GitHub Pages records (four `185.199.x.153` A
records and `www → orbitexpense.me`); they must be deleted. The MX record goes in
**Mail Settings → Custom MX**.

On Vercel, `orbitexpense.me` redirects to `www.orbitexpense.me`, the main address. Then:
- **Render:** `FRONTEND_URL=https://www.orbitexpense.me,https://orbit-expense-tracker.vercel.app`
  (the first entry is where sign-in redirects go), `GOOGLE_CALLBACK_URL=https://www.orbitexpense.me/api/auth/google/callback`,
  `EMAIL_FROM=Orbit <no-reply@orbitexpense.me>` (once Resend shows the domain Verified).
- **Google Cloud** (the OAuth client): authorized JavaScript origin `https://www.orbitexpense.me`,
  redirect URI `https://www.orbitexpense.me/api/auth/google/callback`, and `orbitexpense.me`
  under the consent screen's authorized domains.
- **Vercel:** redirect `orbit-expense-tracker.vercel.app` to `www.orbitexpense.me`
  (Domains → Edit). Google sign-in started on the old address would otherwise fail
  its state check, since the callback now comes back to the new one.

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

- **Backups:** schedule `npm run db:backup` (or Atlas automated backups). It needs `BACKUP_PASSPHRASE` (12+ characters) and writes an AES-256-GCM encrypted file (key from scrypt); without the passphrase the file can't be opened. It covers every collection except `RevokedToken` and `PushSubscription`, and leaves out one-time codes, reset tokens and lockout counters; password hashes stay so accounts still sign in after a restore. To read one: `npm run db:decrypt-backup -- backups/<file>.enc.json [--out <file>]` writes plain JSON with owner-only permissions; delete it when done. Backups taken before 2026-11-17 are plain JSON and include one-time codes: delete them once you have a new one.
- **Logs:** audit events + `[SECURITY]` banner go to **stdout** (captured by Render logs). The local `logs/audit.log` is best-effort only and wiped on restart.
- **Scaling:** with `REDIS_URL` set, rate limits, lockouts and AI budgets are shared, so more than one backend instance is possible; audit events go to stdout. Without Redis, run a **single** instance. The per-key lock in `utils/keyedLock.ts` (it stops two copies of one offline or idempotent create from both inserting) is in-process by default. **Before running a second instance, set `SHARED_LOCKS=on`** (with `REDIS_URL`): it then also takes a Redis lock, waits up to 10 s for another instance's holder, and answers 503 (the client retries) rather than saving unlocked. A Redis that's down falls back to the in-process lock. Locks last at most 30 s, as in-process. The strongest guarantee would be a partial unique index on `(userId, clientRequestId)` (MongoDB `partialFilterExpression`, which Prisma's schema can't express). The notification job is safe either way: its database log has a unique key. `/health/ready` lets the platform restart a wedged instance.
- **Secrets:** rotate `JWT_SECRET` (invalidates all sessions), `GEMINI_API_KEY`, `RESEND_API_KEY` from the platform store — never commit them.

---

## 6. Rollback

- **Code:** redeploy the previous Git SHA on Render/Vercel.
- **Money migration:** if the cents migration ever needs reverting, restore the
  pre-migration `server/backups/<timestamp>.json` (dollar values) into a clean DB,
  or divide the amount fields by 100 with a reverse script + drop the
  `_migrations` marker. The backup from step 2b is the source of truth.
