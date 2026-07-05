const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'] as const;

function readRequiredEnv(name: (typeof requiredEnvVars)[number]): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateServerEnv(): void {
  requiredEnvVars.forEach((key) => {
    readRequiredEnv(key);
  });

  // Fail fast on a weak JWT secret — short secrets are brute-forceable and
  // undermine every signed session token.
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for adequate entropy.');
  }
}

// express `trust proxy` setting. Behind a single reverse proxy (Render, Heroku,
// nginx) this must be set so req.ip resolves to the real client and rate limits
// key per-client instead of collapsing to one global bucket. Numeric strings are
// treated as a hop count; other values (e.g. "loopback") pass through verbatim.
const rawTrustProxy = process.env.TRUST_PROXY;
const trustProxy = rawTrustProxy === undefined
  ? 1
  : (/^\d+$/.test(rawTrustProxy) ? Number(rawTrustProxy) : rawTrustProxy);

export const SERVER_CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  trustProxy,
  bodyLimit: '1mb',
  limits: {
    maxTextLength: 500,
    maxBulkImportSize: 500,
    maxRestoreItemsPerSection: 5000,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    maxEmailLength: 254,
  },
  auth: {
    maxLoginAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000,
    cookieName: 'usc_session',
    csrfCookieName: 'usc_csrf',
    csrfHeaderName: 'x-csrf-token',
    cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  jwtSecret: process.env.JWT_SECRET || '',
} as const;
