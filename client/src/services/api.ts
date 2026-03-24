// Define the base URL for our server
import { Expense, Income, Budget, Semester } from '../types';
import {
  AllDataResponse,
  ApiErrorResponse,
  AuditEventResponse,
  AuthLoginResponse,
  BulkCreateResponse,
  RestoreDataResponse,
} from '../types/api';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * A helper function for making API requests.
 * It handles setting headers and parsing the JSON response.
 */
async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    return null as T;
  }

  // Try to parse JSON, but handle non-JSON responses gracefully
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return null as T;
  }

  if (!response.ok) {
    // If the server returned an error, throw it
    const errorPayload = data as ApiErrorResponse;
    throw new Error(errorPayload.message || errorPayload.error?.message || 'API request failed');
  }

  return data as T;
}

// --- Authentication Functions ---

/**
 * Registers a new user.
 */
export const registerUser = (email: string, password: string) => {
  return fetchApi<{ message: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

/**
 * Verifies OTP for a registered user.
 */
export const verifyOtp = (email: string, otp: string) => {
  return fetchApi<{ message: string }>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
};

/**
 * Resends OTP for a registered user.
 */
export const resendOtp = (email: string) => {
  return fetchApi<{ message: string }>('/auth/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * Logs in a user and returns a token.
 */
export const loginUser = (email: string, password: string): Promise<AuthLoginResponse> => {
  return fetchApi<AuthLoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

/**
 * Sends a password reset code to the user's email.
 */
export const forgotPassword = (email: string) => {
  return fetchApi<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * Resets the user's password with the provided code.
 */
export const resetPassword = (email: string, code: string, newPassword: string) => {
  return fetchApi<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
};

// --- Data Functions ---

/**
 * Fetches all of the logged-in user's data (expenses, incomes, etc.)
 */
export const getAllData = (): Promise<AllDataResponse> => {
  return fetchApi<AllDataResponse>('/data/all', {
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
}): Promise<RestoreDataResponse> => {
  return fetchApi<RestoreDataResponse>('/data/restore', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

/**
 * Sends an audit event to the server for sensitive UI actions.
 */
export const logAuditEvent = (action: string, metadata?: Record<string, unknown>): Promise<AuditEventResponse> => {
  return fetchApi<AuditEventResponse>('/data/audit', {
    method: 'POST',
    body: JSON.stringify({ action, metadata }),
  });
};

/**
 * Creates a new expense.
 * The 'expenseData' is the Omit<Expense, 'id'> from your form.
 */
export const createExpense = (expenseData: Omit<Expense, 'id'>): Promise<Expense> => {
  return fetchApi<Expense>('/expenses', {
    method: 'POST',
    body: JSON.stringify(expenseData),
  });
};

/**
 * Updates an existing expense.
 */
export const updateExpense = (expenseData: Expense): Promise<Expense> => {
  return fetchApi<Expense>(`/expenses/${expenseData.id}`, {
    method: 'PUT',
    body: JSON.stringify(expenseData),
  });
};

/**
 * Deletes an expense.
 */
export const deleteExpense = (id: string): Promise<void> => {
  return fetchApi<void>(`/expenses/${id}`, {
    method: 'DELETE',
  });
};

// --- Income Functions ---

/**
 * Creates a new income.
 */
export const createIncome = (incomeData: Omit<Income, 'id'>): Promise<Income> => {
  return fetchApi<Income>('/incomes', {
    method: 'POST',
    body: JSON.stringify(incomeData),
  });
};

/**
 * Updates an existing income.
 */
export const updateIncome = (incomeData: Income): Promise<Income> => {
  return fetchApi<Income>(`/incomes/${incomeData.id}`, {
    method: 'PUT',
    body: JSON.stringify(incomeData),
  });
};

/**
 * Deletes an income.
 */
export const deleteIncome = (id: string): Promise<void> => {
  return fetchApi<void>(`/incomes/${id}`, {
    method: 'DELETE',
  });
};

// --- Budget Functions ---

/**
 * Saves the user's entire budget list.
 */
export const saveBudgets = (budgets: Budget[]): Promise<Budget[]> => {
  return fetchApi<Budget[]>('/budgets', {
    method: 'POST',
    body: JSON.stringify(budgets),
  });
};

// --- Semester Functions ---

/**
 * Saves the user's entire list of semesters and installments.
 */
export const saveSemesters = (semesters: Semester[]): Promise<Semester[]> => {
  return fetchApi<Semester[]>('/semesters', {
    method: 'POST',
    body: JSON.stringify(semesters),
  });
};

// --- AI Functions ---

/**
 * Gets a financial analysis from the server.
 */
export const getAiAnalysis = (): Promise<{ analysis: string }> => {
  return fetchApi<{ analysis: string }>('/ai/analyze', {
    method: 'POST',
  });
};

/**
 * Creates a batch of new expenses from a CSV import.
 */
export const createBulkExpenses = (expenses: Omit<Expense, 'id'>[]): Promise<BulkCreateResponse> => {
  return fetchApi<BulkCreateResponse>('/expenses/bulk', {
    method: 'POST',
    body: JSON.stringify(expenses),
  });
};