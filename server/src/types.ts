export type Category = string;

export interface Expense {
  id: string;
  title:string;
  amount: number;
  category: Category;
  date: string; // ISO string format: YYYY-MM-DD
  paymentMethod?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  isRecurring?: boolean;
}

export interface Income {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string; // ISO string format: YYYY-MM-DD
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
}

export interface Budget {
  category: string;
  amount: number;
}

export interface TuitionInstallment {
  id: number;
  amount: number;
  status: 'paid' | 'unpaid';
  expenseId?: string;
  paidDate?: string;
}

export interface Semester {
  id: string; // e.g., 'fall-2025'
  name: string;
  totalTuition: number;
  installments: TuitionInstallment[];
}

// --- GLOBAL TYPE AUGMENTATION ---
// This file is imported almost everywhere, so these types will be available globally.

// 1. Define the shape of our user, whether from JWT or Google
interface AuthUser {
  id: string;      // <-- We are standardizing on 'id'
  email: string;
}

// 2. Augment Express's 'User' type
// This tells Passport and our JWT middleware to use this shape
declare global {
  namespace Express {
    export interface User extends AuthUser {}
    
    // We also make sure the Request object uses this new User type
    export interface Request {
      user?: User;
    }
  }
}