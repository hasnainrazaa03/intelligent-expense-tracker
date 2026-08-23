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
  requiresTwoFactor?: boolean;
  twoFactorEnabled?: boolean;
  email?: string;
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
  /** Rows written (or already present when `duplicate` is true). */
  imported?: number;
  /** True when the batch key was already used, so nothing new was inserted. */
  duplicate?: boolean;
}

export interface AuditEventResponse {
  success: boolean;
}
