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

/** Error thrown by the API client, carrying the HTTP status so callers can react
 *  to 401/403 by status instead of fragile message-string matching (APP-H2). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True for auth failures that should trigger a client-side logout. */
export const isAuthError = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

/**
 * A helper function for making API requests. Handles headers, CSRF, and JSON
 * parsing. Caching/dedup is now owned by TanStack Query (which keys per query
 * and per user session), replacing the previous hand-rolled response cache whose
 * constant key could serve one user's data to the next on the same tab (APP-M6).
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

  const csrfToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('usc_csrf='))
    ?.split('=')[1];

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers.set('x-csrf-token', decodeURIComponent(csrfToken));
  }

  const runRequest = async (): Promise<T> => {
    // Build the request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
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
        throw new ApiError(`Request failed with status ${response.status}`, response.status);
      }
      return null as T;
    }

    if (!response.ok) {
      // If the server returned an error, throw it (with status for callers).
      const errorPayload = data as ApiErrorResponse;
      const message = errorPayload.message || errorPayload.error?.message || 'API request failed';
      throw new ApiError(message, response.status);
    }

    return data as T;
  };

  const requestPromise = runRequest();

  return requestPromise;
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

export const verifyLoginOtp = (email: string, otp: string): Promise<AuthLoginResponse> => {
  return fetchApi<AuthLoginResponse>('/auth/verify-login-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
};

export const getSession = (): Promise<{ authenticated: boolean; email: string; twoFactorEnabled: boolean }> => {
  return fetchApi('/auth/session', { method: 'GET' });
};

export const toggleTwoFactor = (
  enabled: boolean,
  password?: string
): Promise<{ message: string; twoFactorEnabled: boolean }> => {
  return fetchApi('/auth/2fa/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled, password }),
  });
};

export const logoutUser = (): Promise<{ message: string }> => {
  return fetchApi('/auth/logout', {
    method: 'POST',
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

/** Email the signed-in user a summary of their current-month finances. */
export const emailSummary = (): Promise<{ message: string }> => {
  return fetchApi<{ message: string }>('/reports/email-summary', { method: 'POST' });
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

export const chatWithAi = (
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ reply: string }> => {
  return fetchApi<{ reply: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
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