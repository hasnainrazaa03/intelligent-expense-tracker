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

const app = express();
const PORT = process.env.PORT || 3001; // Use 3001 for the server

// --- Middleware ---
app.use(cors()); // Allow requests from your React app
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