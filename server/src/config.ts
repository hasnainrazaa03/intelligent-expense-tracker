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
}

export const SERVER_CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  bodyLimit: '1mb',
  limits: {
    maxTextLength: 500,
    maxBulkImportSize: 500,
    maxRestoreItemsPerSection: 5000,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    maxEmailLength: 254,
  },
  auth: {
    maxLoginAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000,
  },
  jwtSecret: process.env.JWT_SECRET || '',
} as const;
