# Server tests

```bash
cd server
npm test                       # unit tests only (API tests are skipped)
TEST_DATABASE_URL="mongodb://localhost:27018/orbit_test?replicaSet=rs0&directConnection=true" npm test
npm run typecheck              # app + tests
```

- `tests/unit/` — pure helpers (money, amounts, sanitising, lockout, locks). No setup.
- `tests/api/` — the real Express app (`src/app.ts`) driven by supertest against
  a throwaway MongoDB. They run only when `TEST_DATABASE_URL` is set.
  - **That database is dropped at the start of every run.** The URL must be a
    local database whose name contains `test`; anything else (including any
    `mongodb+srv://` Atlas URL) is refused.
  - MongoDB must run as a replica set (Prisma needs one). The local Docker
    container does: `docker run -d -p 27018:27017 mongo:7 --replSet rs0` and then
    `rs.initiate()` once.
- Email is never sent: `tests/setup.ts` mocks the mailer and records each code in
  `tests/mailbox.ts` (`lastCode(email, 'verification')`).
- Gemini is never called: `api/ai.test.ts` starts a local stand-in and points
  `GEMINI_BASE_URL` at it.
- Rate limits stay on. Each test client sends its own `X-Forwarded-For`
  (`TRUST_PROXY=1` in tests), so it gets its own bucket.

The end-to-end suite (`client/tests/e2e`) uses `scripts/ensure-test-user.ts` for its
accounts (`test@test.com`, `e2e-restore@test.com`, and `e2e-delete@test.com`, which the
account-deletion test deletes: re-run the script for it before each local run, or that
test skips) and `scripts/mock-gemini.mjs` for AI.
