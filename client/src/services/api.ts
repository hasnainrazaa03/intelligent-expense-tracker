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

// --- CSRF token handling ---
// The csrf cookie is set with httpOnly:false so it CAN be read same-origin. But
// when the SPA is served from a different origin than the API (e.g. a Vercel
// frontend + a Render backend), document.cookie can't see the API-domain cookie,
// so we bootstrap the token from GET /auth/csrf and cache it in memory. The
// cookie is still sent automatically with `credentials: 'include'`; the header
// just has to carry the same value (double-submit).
let cachedCsrfToken: string | null = null;

const readCsrfCookie = (): string | null => {
  const raw = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('usc_csrf='))
    ?.split('=')[1];
  return raw ? decodeURIComponent(raw) : null;
};

const ensureCsrfToken = async (): Promise<string | null> => {
  const fromCookie = readCsrfCookie();
  if (fromCookie) return fromCookie; // same-origin / local dev
  if (cachedCsrfToken) return cachedCsrfToken;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data?.csrfToken ?? null;
      return cachedCsrfToken;
    }
  } catch {
    /* network error — the caller's request will surface its own failure */
  }
  return null;
};

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
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (method !== 'GET' && method !== 'DELETE' && method !== 'HEAD') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (isWrite) {
    const token = await ensureCsrfToken();
    if (token) headers.set('x-csrf-token', token);
  }

  const send = (): Promise<Response> =>
    fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });

  const parse = async (response: Response): Promise<T> => {
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

  let response = await send();

  // Self-heal a cross-origin CSRF mismatch once: the cached token can go stale
  // after a fresh login re-issued a different csrf cookie, so refresh and retry.
  if (response.status === 403 && isWrite) {
    cachedCsrfToken = null;
    const token = await ensureCsrfToken();
    if (token) {
      headers.set('x-csrf-token', token);
      response = await send();
    }
  }

  return parse(response);
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
/** Permanently deletes ALL of the user's financial data. Requires the exact
 *  confirmation phrase "DELETE" (also enforced server-side). */
export const wipeAllData = (confirm: string): Promise<{ message: string; deleted: Record<string, number> }> => {
  return fetchApi<{ message: string; deleted: Record<string, number> }>('/data/wipe', {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
};

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

// --- Households (shared/household accounts) ---
export interface HouseholdMember {
  id: string;
  userId: string | null;
  invitedEmail: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
}
export interface Household {
  id: string;
  name: string;
  ownerId: string;
  myRole: 'owner' | 'member';
  members: HouseholdMember[];
}
export interface HouseholdsResponse {
  households: Household[];
  invites: { id: string; name: string }[];
}

export const listHouseholds = (): Promise<HouseholdsResponse> => fetchApi<HouseholdsResponse>('/households');
export const createHousehold = (name: string): Promise<Household> =>
  fetchApi<Household>('/households', { method: 'POST', body: JSON.stringify({ name }) });
export const inviteToHousehold = (id: string, email: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/households/${id}/invite`, { method: 'POST', body: JSON.stringify({ email }) });
export const acceptHouseholdInvite = (id: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/households/${id}/accept`, { method: 'POST' });
export const declineHouseholdInvite = (id: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/households/${id}/decline`, { method: 'POST' });
export const leaveHousehold = (id: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/households/${id}/leave`, { method: 'DELETE' });
export const deleteHousehold = (id: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/households/${id}`, { method: 'DELETE' });

export interface HouseholdExpense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  payerEmail: string;
}
export interface HouseholdSettle {
  email: string;
  paid: number;
  share: number;
  balance: number;
}
export interface HouseholdPool {
  expenses: HouseholdExpense[];
  total: number;
  memberCount: number;
  settleUp: HouseholdSettle[];
}
export const getHouseholdExpenses = (id: string): Promise<HouseholdPool> =>
  fetchApi<HouseholdPool>(`/households/${id}/expenses`);

// --- Receipt images (stored separately, fetched on demand) ---
export const getReceipt = (expenseId: string): Promise<{ image: string }> =>
  fetchApi<{ image: string }>(`/expenses/${expenseId}/receipt`);
export const uploadReceipt = (expenseId: string, image: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/expenses/${expenseId}/receipt`, { method: 'PUT', body: JSON.stringify({ image }) });
export const deleteReceipt = (expenseId: string): Promise<{ message: string }> =>
  fetchApi<{ message: string }>(`/expenses/${expenseId}/receipt`, { method: 'DELETE' });

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

export interface ParsedReceipt {
  title: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  paymentMethod: string;
  notes: string;
}

/**
 * Sends a receipt image (base64 data URI) to Gemini and returns structured
 * fields (title/amount/currency/date/category/payment) to pre-fill the form.
 */
export const parseReceipt = (image: string): Promise<{ receipt: ParsedReceipt }> => {
  return fetchApi<{ receipt: ParsedReceipt }>('/ai/parse-receipt', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });
};

export interface ParsedStatementTxn {
  type: 'income' | 'expense';
  date: string;
  description: string;
  amount: number;
  category: string;
  paymentMethod: string;
}

/**
 * Sends a bank statement to Gemini for parsing. Pass a base64 PDF data URI or
 * raw CSV text; returns the detected expense/income transactions with suggested
 * categories for the user to review before importing.
 */
export const parseStatement = (
  input: { pdf?: string; csvText?: string }
): Promise<{ transactions: ParsedStatementTxn[] }> => {
  return fetchApi<{ transactions: ParsedStatementTxn[] }>('/ai/parse-statement', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

export interface TransactionDetails {
  notes: string;
  tags: string[];
  category: string;
  paymentMethod: string;
}

/**
 * Asks Gemini to auto-generate optional details (note, tags, refined category /
 * payment method) for a single transaction being imported.
 */
export const enrichTransaction = (
  input: { type: 'income' | 'expense'; description: string; amount: number; category?: string }
): Promise<{ details: TransactionDetails }> => {
  return fetchApi<{ details: TransactionDetails }>('/ai/enrich-transaction', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

export interface BatchTransactionDetails extends TransactionDetails {
  i: number;
}

/**
 * Enriches a whole list of transactions in ONE model call (used by "AI-fill all"
 * so it doesn't fire one request per row and hit the AI rate limit).
 */
export const enrichTransactions = (
  transactions: Array<{ type: 'income' | 'expense'; description: string; amount: number; category?: string }>
): Promise<{ details: BatchTransactionDetails[] }> => {
  return fetchApi<{ details: BatchTransactionDetails[] }>('/ai/enrich-transactions', {
    method: 'POST',
    body: JSON.stringify({ transactions }),
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

/**
 * Creates a batch of new incomes (e.g. a bank statement's detected credits).
 */
export const createBulkIncomes = (incomes: Omit<Income, 'id'>[]): Promise<BulkCreateResponse> => {
  return fetchApi<BulkCreateResponse>('/incomes/bulk', {
    method: 'POST',
    body: JSON.stringify(incomes),
  });
};