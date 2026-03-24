// Define the base URL for our server
import { Expense, Income, Budget, Semester } from '../types';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * A helper function for making API requests.
 * It handles setting headers and parsing the JSON response.
 */
async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  // Only set Content-Type for requests with a body
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'DELETE' && method !== 'HEAD') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  // Get the auth token from localStorage (if it exists)
  const token = localStorage.getItem('authToken');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Build the request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return null;
  }

  // Try to parse JSON, but handle non-JSON responses gracefully
  let data: any;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return null;
  }

  if (!response.ok) {
    // If the server returned an error, throw it
    throw new Error(data.message || 'API request failed');
  }

  return data;
}

// --- Authentication Functions ---

/**
 * Registers a new user.
 */
export const registerUser = (email: string, password: string) => {
  return fetchApi('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

/**
 * Verifies OTP for a registered user.
 */
export const verifyOtp = (email: string, otp: string) => {
  return fetchApi('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
};

/**
 * Resends OTP for a registered user.
 */
export const resendOtp = (email: string) => {
  return fetchApi('/auth/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * Logs in a user and returns a token.
 */
export const loginUser = (email: string, password: string): Promise<{ message: string, token: string }> => {
  return fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

/**
 * Sends a password reset code to the user's email.
 */
export const forgotPassword = (email: string) => {
  return fetchApi('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * Resets the user's password with the provided code.
 */
export const resetPassword = (email: string, code: string, newPassword: string) => {
  return fetchApi('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
};

// --- Data Functions ---

/**
 * Fetches all of the logged-in user's data (expenses, incomes, etc.)
 */
export const getAllData = (): Promise<{
  expenses: any[];
  incomes: any[];
  budgets: any[];
  semesters: any[];
}> => {
  return fetchApi('/data/all', {
    method: 'GET',
  });
};

/**
 * Restores all user data from a backup payload.
 */
export const restoreAllData = (payload: {
  expenses: Omit<Expense, 'id'>[];
  incomes: Omit<Income, 'id'>[];
  budgets: Budget[];
  semesters: Semester[];
}): Promise<{
  message: string;
  expenses: any[];
  incomes: any[];
  budgets: any[];
  semesters: any[];
}> => {
  return fetchApi('/data/restore', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

/**
 * Creates a new expense.
 * The 'expenseData' is the Omit<Expense, 'id'> from your form.
 */
export const createExpense = (expenseData: Omit<Expense, 'id'>): Promise<Expense> => {
  return fetchApi('/expenses', {
    method: 'POST',
    body: JSON.stringify(expenseData),
  });
};

/**
 * Updates an existing expense.
 */
export const updateExpense = (expenseData: Expense): Promise<Expense> => {
  return fetchApi(`/expenses/${expenseData.id}`, {
    method: 'PUT',
    body: JSON.stringify(expenseData),
  });
};

/**
 * Deletes an expense.
 */
export const deleteExpense = (id: string): Promise<void> => {
  return fetchApi(`/expenses/${id}`, {
    method: 'DELETE',
  });
};

// --- Income Functions ---

/**
 * Creates a new income.
 */
export const createIncome = (incomeData: Omit<Income, 'id'>): Promise<Income> => {
  return fetchApi('/incomes', {
    method: 'POST',
    body: JSON.stringify(incomeData),
  });
};

/**
 * Updates an existing income.
 */
export const updateIncome = (incomeData: Income): Promise<Income> => {
  return fetchApi(`/incomes/${incomeData.id}`, {
    method: 'PUT',
    body: JSON.stringify(incomeData),
  });
};

/**
 * Deletes an income.
 */
export const deleteIncome = (id: string): Promise<void> => {
  return fetchApi(`/incomes/${id}`, {
    method: 'DELETE',
  });
};

// --- Budget Functions ---

/**
 * Saves the user's entire budget list.
 */
export const saveBudgets = (budgets: Budget[]): Promise<Budget[]> => {
  return fetchApi('/budgets', {
    method: 'POST',
    body: JSON.stringify(budgets),
  });
};

// --- Semester Functions ---

/**
 * Saves the user's entire list of semesters and installments.
 */
export const saveSemesters = (semesters: Semester[]): Promise<Semester[]> => {
  return fetchApi('/semesters', {
    method: 'POST',
    body: JSON.stringify(semesters),
  });
};

// --- AI Functions ---

/**
 * Gets a financial analysis from the server.
 */
export const getAiAnalysis = (): Promise<{ analysis: string }> => {
  return fetchApi('/ai/analyze', {
    method: 'POST',
  });
};

/**
 * Creates a batch of new expenses from a CSV import.
 */
export const createBulkExpenses = (expenses: Omit<Expense, 'id'>[]): Promise<{ message: string }> => {
  return fetchApi('/expenses/bulk', {
    method: 'POST',
    body: JSON.stringify(expenses),
  });
};