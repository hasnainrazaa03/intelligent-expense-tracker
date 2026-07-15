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

  const isProd = process.env.NODE_ENV === 'production';

  // Trusting a spoofable X-Forwarded-For by default lets a client forge req.ip
  // and bypass the IP-keyed login/OTP/reset limiters. In production the operator
  // must state the proxy topology explicitly (e.g. TRUST_PROXY=1 behind exactly
  // one proxy such as Render, or TRUST_PROXY=false if the app is directly exposed).
  if (isProd && process.env.TRUST_PROXY === undefined) {
    throw new Error(
      'In production you must set TRUST_PROXY explicitly (e.g. TRUST_PROXY=1 behind exactly one reverse proxy, or TRUST_PROXY=false if directly exposed). Defaulting to trust would allow X-Forwarded-For spoofing.'
    );
  }

  // Session cookies are only Secure + SameSite=None when NODE_ENV=production, and
  // CORS only enforces the strict allowlist in production. Make a non-production
  // deployment loud rather than silently shipping insecure cookies over HTTP.
  if (!isProd) {
    console.warn(
      `[SECURITY] NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} — session cookies are NOT Secure and CORS is permissive (any-localhost). Set NODE_ENV=production for any public deployment.`
    );
  }
}

// express `trust proxy` setting. Behind a single reverse proxy (Render, Heroku,
// nginx) this must be set so req.ip resolves to the real client and rate limits
// key per-client instead of collapsing to one global bucket. Numeric strings are
// a hop count; "true"/"false" map to booleans; other values (e.g. "loopback")
// pass through verbatim. Defaults to `false` (no proxy trusted) — production is
// forced to set it explicitly in validateServerEnv above.
const rawTrustProxy = process.env.TRUST_PROXY;
const parseTrustProxy = (raw: string): number | boolean | string => {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
};
const trustProxy = rawTrustProxy === undefined ? false : parseTrustProxy(rawTrustProxy);

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
