import * as dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import passport from 'passport';
import helmet from 'helmet';
import './passport-setup';
import { apiLimiter, aiLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import dataRoutes from './routes/data';
import expenseRoutes from './routes/expenses';
import incomeRoutes from './routes/incomes';
import budgetRoutes from './routes/budgets';
import semesterRoutes from './routes/semesters';
import aiRoutes from './routes/ai';

const app = express();
const PORT = process.env.PORT || 3001;

// --- Security Middleware ---
app.use(helmet());

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
app.use(express.json({ limit: '1mb' }));

// --- Health Check (before auth) ---
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Passport (no session — Google OAuth uses session: false) ---
app.use(passport.initialize());

// --- General API Rate Limiting ---
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});