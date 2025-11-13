// Define the base URL for our server
import { Expense, Income, Budget, Semester } from '../types';
const API_BASE_URL = 'http://localhost:3001/api';

/**
 * A helper function for making API requests.
 * It handles setting headers and parsing the JSON response.
 */
async function fetchApi(endpoint: string, options: RequestInit = {}) {
  // Set default headers
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...options.headers,
  });

  // Get the auth token from localStorage (if it exists)
  const token = localStorage.getItem('authToken');
  if (token) {
    headers.append('Authorization', `Bearer ${token}`);
  }

  // Build the request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Parse the JSON response
  const data = await response.json();

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
 * Logs in a user and returns a token.
 */
export const loginUser = (email: string, password: string): Promise<{ message: string, token: string }> => {
  return fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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
    method: 'GET',
  });
};

/**
 * Creates a batch of new expenses from a CSV import.
 */
export const createBulkExpenses = (expenses: Omit<Expense, 'id'>[]): Promise<any> => {
  return fetchApi('/expenses/bulk', {
    method: 'POST',
    body: JSON.stringify(expenses),
  });
};