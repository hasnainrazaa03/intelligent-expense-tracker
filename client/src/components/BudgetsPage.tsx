import React, { useMemo } from 'react';
import type { Budget, Expense, Income } from '../types';
import BudgetTracker from './BudgetTracker';
import BudgetPerformanceChart from './BudgetPerformanceChart';
import FinancialPlanningPanel from './FinancialPlanningPanel';
import SectionSkeleton from './SectionSkeleton';
import { Button } from './ui';
import { useToday } from '../hooks/useToday';
import { buildBudgetPerformance } from '../utils/chartData';

/**
 * Budgets (U2a): this month's budgets, month by month, and the way to set
 * them, as a place of its own instead of a pencil icon in the header. Since
 * U3 it also holds what left Home: the last six months against the budget,
 * and planning (savings goals, recurring charges, accounts, households).
 */
const BudgetsPage: React.FC<{ expenses: Expense[]; incomes: Income[]; budgets: Budget[]; isLoading: boolean; onEdit: () => void }> = ({
  expenses, incomes, budgets, isLoading, onEdit,
}) => {
  const today = useToday();
  const performance = useMemo(() => buildBudgetPerformance(expenses, budgets, today), [expenses, budgets, today]);
  return (
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
    {budgets.length > 0 && (
      <section className="glass rounded-2xl p-4 md:p-5" aria-labelledby="budgets-history">
        <h3 id="budgets-history" className="font-display text-base md:text-lg font-semibold mb-4 text-app-text">Last 6 months</h3>
        <div className="h-64 md:h-72"><BudgetPerformanceChart data={performance} /></div>
      </section>
    )}
    {!isLoading && <FinancialPlanningPanel expenses={expenses} incomes={incomes} />}
  </div>
  );
};

export default BudgetsPage;
