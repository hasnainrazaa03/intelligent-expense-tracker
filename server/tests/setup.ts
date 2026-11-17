import { vi } from 'vitest';

// Runs before each test file, ahead of any src/ import (they read env at load).
// Values set here win over server/.env, which dotenv never overrides.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789-abcdefghij';
process.env.RESEND_API_KEY = 're_test_not_a_real_key';
process.env.EMAIL_FROM = 'Orbit Tests <tests@example.invalid>';
process.env.GEMINI_API_KEY = 'test-gemini-key'; // calls go to a local mock (GEMINI_BASE_URL)
process.env.FRONTEND_URL = 'http://localhost:4173';
// Each test client sends its own X-Forwarded-For, so it gets its own
// rate-limit bucket; the limiters stay on and can be tested.
process.env.TRUST_PROXY = '1';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'mongodb://127.0.0.1:1/no-test-database';

// Never send real email: record it instead (see mailbox.ts).
vi.mock('../src/utils/mailer', async () => {
  const { mailbox } = await import('./mailbox');
  const ok = { success: true as const };
  return {
    resend: {},
    sendVerificationEmail: vi.fn(async (to: string, code: string) => { mailbox.push({ kind: 'verification', to, code }); return ok; }),
    sendTwoFactorEmail: vi.fn(async (to: string, code: string) => { mailbox.push({ kind: 'two-factor', to, code }); return ok; }),
    sendPasswordResetEmail: vi.fn(async (to: string, code: string) => { mailbox.push({ kind: 'password-reset', to, code }); return ok; }),
    sendGenericEmail: vi.fn(async (to: string, subject: string) => { mailbox.push({ kind: 'generic', to, subject }); return ok; }),
  };
});
