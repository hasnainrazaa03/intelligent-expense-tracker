// The Express app, without listening: index.ts starts it, and the server tests
// import it directly (supertest), so building it must have no other side effects.
import * as dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import './passport-setup';
import { apiLimiter, aiLimiter, userApiLimiter } from './middleware/rateLimiter';
import { csrfProtection } from './middleware/csrf';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import dataRoutes from './routes/data';
import expenseRoutes from './routes/expenses';
import incomeRoutes from './routes/incomes';
import budgetRoutes from './routes/budgets';
import semesterRoutes from './routes/semesters';
import aiRoutes from './routes/ai';
import reportRoutes from './routes/reports';
import householdRoutes from './routes/households';
import settingsRoutes from './routes/settings';
import { sendError } from './utils/http';
import { SERVER_CONFIG, validateServerEnv } from './config';
import { swaggerSpec } from './swagger';
import { prisma } from './db';
import { authMiddleware } from './middleware/auth';

validateServerEnv();

const app = express();

// --- Trust the reverse proxy so req.ip is the real client (rate limits depend
// on this behind Render/Heroku/nginx). ---
app.set('trust proxy', SERVER_CONFIG.trustProxy);

// --- Security Middleware ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// --- CORS ---
const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, '');

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin);

const allowedOrigins = [
  normalizeOrigin('http://localhost:5173'),
  ...configuredOrigins,
];

// In development, accept any localhost / 127.0.0.1 origin regardless of port so
// the dev server and `vite preview` (5173, 4173, …) both work without config.
// Production stays on the strict allowlist (localhost:5173 + FRONTEND_URL).
const isDev = process.env.NODE_ENV !== 'production';
const isLocalhostOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized) || (isDev && isLocalhostOrigin(normalized))) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true
}));

app.use(cookieParser());

// --- Body parsing with size limit ---
// Every route gets the 1mb parser except two that need more: statement PDFs
// (read by Gemini natively) and full-backup restores (a backup of a few
// thousand transactions is over 1mb, so restoring it failed with a 413 that
// surfaced as a 500). Their larger parsers run only AFTER authentication, so an
// anonymous client can't make the server buffer 15mb bodies (S13, S3).
const LARGE_BODY_LIMITS: Record<string, string> = {
  '/api/ai/parse-statement': '15mb',
  '/api/data/restore': '12mb',
};
const defaultJson = express.json({ limit: SERVER_CONFIG.bodyLimit });
// Express 5 leaves req.body undefined when there's no JSON body, and handlers
// that destructure it crashed with a 500.
const ensureBody = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body === undefined) req.body = {};
  next();
};
app.use((req: Request, res: Response, next: NextFunction) =>
  LARGE_BODY_LIMITS[req.path] ? next() : defaultJson(req, res, next)
);
for (const [path, limit] of Object.entries(LARGE_BODY_LIMITS)) {
  app.use(path, authMiddleware, express.json({ limit }));
}
app.use(ensureBody);

// --- Structured request logging with request id ---
app.use(requestLogger);

// --- Liveness check (cheap, before auth): the process is up ---
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Readiness check: also verify the database is reachable, so a load balancer
// can route traffic away from an instance that can't serve requests. ---
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unavailable', timestamp: new Date().toISOString() });
  }
});

// API docs are an API-surface disclosure, so they're off in production unless
// ENABLE_API_DOCS=true is set explicitly (available in dev by default).
const apiDocsEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';
if (apiDocsEnabled) {
  app.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.status(200).json(swaggerSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
}

// --- Passport (no session — Google OAuth uses session: false) ---
app.use(passport.initialize());

// --- General API Rate Limiting ---
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/data', userApiLimiter, csrfProtection, dataRoutes);
app.use('/api/expenses', userApiLimiter, csrfProtection, expenseRoutes);
app.use('/api/incomes', userApiLimiter, csrfProtection, incomeRoutes);
app.use('/api/budgets', userApiLimiter, csrfProtection, budgetRoutes);
app.use('/api/semesters', userApiLimiter, csrfProtection, semesterRoutes);
app.use('/api/ai', userApiLimiter, csrfProtection, aiLimiter, aiRoutes);
app.use('/api/reports', userApiLimiter, csrfProtection, reportRoutes);
app.use('/api/households', userApiLimiter, csrfProtection, householdRoutes);
app.use('/api/settings', userApiLimiter, csrfProtection, settingsRoutes);

// --- Global Error Handler ---
// Client errors keep their status: malformed JSON (400), an oversized body (413)
// and a rejected origin (403) all used to come back as 500 "Internal server
// error" and were logged as crashes (S16).
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
  }
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (typeof err?.message === 'string' && err.message.startsWith('The CORS policy')) {
    return sendError(res, 403, 'CORS_REJECTED', 'This origin is not allowed.');
  }
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    return sendError(res, status, 'BAD_REQUEST', err?.expose ? String(err.message) : 'Bad request');
  }
  console.error('Unhandled error:', err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
});

export default app;
