import { Budget, Expense, Income, Semester } from '../types';

export interface ApiErrorResponse {
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface AuthLoginResponse {
  message: string;
  token: string;
}

export interface AllDataResponse {
  expenses: Expense[];
  incomes: Income[];
  budgets: Budget[];
  semesters: Semester[];
}

export interface RestoreDataResponse extends AllDataResponse {
  message: string;
}

export interface BulkCreateResponse {
  message: string;
}

export interface AuditEventResponse {
  success: boolean;
}
