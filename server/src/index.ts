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
import { sendError } from './utils/http';
import { SERVER_CONFIG, validateServerEnv } from './config';
import { swaggerSpec } from './swagger';
import { prisma } from './db';

validateServerEnv();

const app = express();
const HOST = SERVER_CONFIG.host;
const PORT = SERVER_CONFIG.port;

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

// --- Body parsing with size limit ---
app.use(express.json({ limit: SERVER_CONFIG.bodyLimit }));
app.use(cookieParser());

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

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
});

// --- Start the server ---
const isProd = process.env.NODE_ENV === 'production';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(
    `[SECURITY] mode=${isProd ? 'production' : 'development'} · secure-cookies=${isProd} · cors=${isProd ? 'strict-allowlist' : 'any-localhost'} · trust-proxy=${String(SERVER_CONFIG.trustProxy)}`
  );
  if (!isProd) {
    console.warn('[SECURITY] Non-production mode — cookies are NOT Secure and CORS is permissive. Do NOT expose this process publicly.');
  }
});

// --- Graceful shutdown: stop accepting connections, drain in-flight requests,
// then disconnect Prisma. A hard timeout guarantees the process still exits. ---
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully…`);
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error during Prisma disconnect:', err);
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Last-resort guards for non-request code paths (Express 5 already forwards
// async route rejections to the error handler above).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});