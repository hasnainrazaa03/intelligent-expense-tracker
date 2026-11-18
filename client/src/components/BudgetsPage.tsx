import React from 'react';
import type { Budget, Expense } from '../types';
import BudgetTracker from './BudgetTracker';
import SectionSkeleton from './SectionSkeleton';
import { Button } from './ui';

/**
 * Budgets (U2a): this month's budgets, month by month, and the way to set
 * them, as a place of its own instead of a pencil icon in the header. Goals,
 * recurring charges and accounts join it in later phases.
 */
const BudgetsPage: React.FC<{ expenses: Expense[]; budgets: Budget[]; isLoading: boolean; onEdit: () => void }> = ({
  expenses, budgets, isLoading, onEdit,
}) => (
  <div className="space-y-5 md:space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[10px] font-medium tracking-[0.18em] uppercase text-app-muted">Plan</span>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight mt-1.5">Budgets</h2>
        <p className="text-sm text-app-muted mt-1">A monthly limit for each category, and how much of it you've used.</p>
      </div>
      <Button onClick={onEdit} className="self-start sm:self-auto">{budgets.length ? 'Edit budgets' : 'Set budgets'}</Button>
    </div>
    <section className="glass rounded-2xl p-4 md:p-6" aria-label="This month's budgets">
      {isLoading ? <SectionSkeleton title="Loading budgets" rows={4} /> : <BudgetTracker expenses={expenses} budgets={budgets} />}
    </section>
  </div>
);

export default BudgetsPage;
