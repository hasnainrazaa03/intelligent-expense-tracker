import * as dotenv from 'dotenv';
dotenv.config();
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
import MongoStore from 'connect-mongo';

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
    secret: process.env.JWT_SECRET || 'fallback_secret', 
    resave: false, // Set to false when using a database store like MongoStore
    saveUninitialized: false, // Set to false to comply with GDPR/privacy laws
    store: MongoStore.create({
      mongoUrl: process.env.DATABASE_URL,
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: { 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
    }
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