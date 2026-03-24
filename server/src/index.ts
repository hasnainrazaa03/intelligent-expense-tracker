import * as dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import passport from 'passport';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import './passport-setup';
import { apiLimiter, aiLimiter, userApiLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import dataRoutes from './routes/data';
import expenseRoutes from './routes/expenses';
import incomeRoutes from './routes/incomes';
import budgetRoutes from './routes/budgets';
import semesterRoutes from './routes/semesters';
import aiRoutes from './routes/ai';
import { sendError } from './utils/http';
import { SERVER_CONFIG, validateServerEnv } from './config';
import { swaggerSpec } from './swagger';

validateServerEnv();

const app = express();
const PORT = SERVER_CONFIG.port;

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
const allowedOrigins = [
  'http://localhost:5173', // Local development
  process.env.FRONTEND_URL  // Your Vercel domain
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// --- Body parsing with size limit ---
app.use(express.json({ limit: SERVER_CONFIG.bodyLimit }));

// --- Structured request logging with request id ---
app.use(requestLogger);

// --- Health Check (before auth) ---
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/openapi.json', (_req: Request, res: Response) => {
  res.status(200).json(swaggerSpec);
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// --- Passport (no session — Google OAuth uses session: false) ---
app.use(passport.initialize());

// --- General API Rate Limiting ---
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/data', userApiLimiter, dataRoutes);
app.use('/api/expenses', userApiLimiter, expenseRoutes);
app.use('/api/incomes', userApiLimiter, incomeRoutes);
app.use('/api/budgets', userApiLimiter, budgetRoutes);
app.use('/api/semesters', userApiLimiter, semesterRoutes);
app.use('/api/ai', userApiLimiter, aiLimiter, aiRoutes);

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});