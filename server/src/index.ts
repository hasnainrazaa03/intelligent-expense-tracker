import "dotenv/config"; // This line MUST be first
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import './passport-setup';
import authRoutes from './routes/auth'; // Import our new routes
import dataRoutes from './routes/data';
import expenseRoutes from './routes/expenses';
import incomeRoutes from './routes/incomes';
import budgetRoutes from './routes/budgets';
import semesterRoutes from './routes/semesters';
import aiRoutes from './routes/ai';
import { transporter } from './utils/mailer';

const app = express();
const PORT = process.env.PORT || 3001; // Use 3001 for the server

// --- Middleware ---
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
app.use(express.json()); // Allow the server to read JSON bodies

// --- PASSPORT MIDDLEWARE ---
// This must be added for Passport to work
app.use(session({
    secret: process.env.JWT_SECRET!, // Re-use our JWT secret
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Use 'true' in production (HTTPS)
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Routes ---
app.use('/api/auth', authRoutes); // All auth routes will start with /api/auth
app.use('/api/data', dataRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/ai', aiRoutes);

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

transporter.verify((error, success) => {
  if (error) {
    console.warn('⚠️ Mailer configuration warning:', error.message);
  } else {
    console.log('📧 Mailer is ready to dispatch codes');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});