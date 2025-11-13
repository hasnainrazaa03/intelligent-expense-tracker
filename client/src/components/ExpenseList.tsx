
import React, { useState } from 'react';
import { Expense } from '../types';
import { getCategoryColor } from '../utils/colorUtils';
import { PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, CreditCardIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, children }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title: string, children: React.ReactNode }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-base-100 dark:bg-dark-200 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center border-b border-base-200 dark:border-dark-300">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 sm:mx-0 sm:h-10 sm:w-10">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-bold text-base-content dark:text-base-100 ml-4">{title}</h3>
                </div>
                <div className="p-6 text-base-content-secondary dark:text-base-300">
                    {children}
                </div>
                <div className="flex justify-end p-4 bg-base-200/50 dark:bg-dark-300/50 rounded-b-lg space-x-3">
                    <button onClick={onClose} className="px-4 py-2 bg-base-100 dark:bg-dark-200 text-base-content dark:text-base-200 rounded-md hover:bg-base-300/70 dark:hover:bg-dark-100 border border-base-300 dark:border-dark-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};


const ExpenseItem: React.FC<{ expense: Expense; onEdit: (expense: Expense) => void; onDelete: (id: string) => void; displayCurrency: 'USD' | 'INR'; conversionRate: number | null; }> = ({ expense, onEdit, onDelete, displayCurrency, conversionRate }) => {
    const color = getCategoryColor(expense.category);
    return (
        <li className="flex items-start p-4 space-x-4 bg-base-100 dark:bg-dark-200 rounded-lg transition-shadow hover:shadow-md">
        <div className="flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center mt-1" style={{ backgroundColor: `${color}20`, color: color }}>
            <TagIcon className="h-6 w-6" />
        </div>
        <div className="flex-grow">
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-semibold text-base-content dark:text-base-100">{expense.title}</h4>
                    <p className="text-sm font-semibold" style={{ color: color }}>{expense.category}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                    <span className="text-lg font-bold text-base-content dark:text-base-100">{formatCurrency(expense.amount, displayCurrency, conversionRate)}</span>
                    {expense.originalAmount && expense.originalCurrency && (
                        <span className="text-xs text-base-content-secondary dark:text-base-300">
                            ({expense.originalAmount.toFixed(2)} {expense.originalCurrency})
                        </span>
                    )}
                </div>
            </div>
            {expense.notes && (
                <div className="flex items-start mt-2 text-sm text-base-content-secondary dark:text-base-300">
                    <ChatBubbleBottomCenterTextIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <p className="whitespace-pre-wrap">{expense.notes}</p>
                </div>
            )}
            <div className="flex justify-between items-end mt-2 text-sm text-base-content-secondary dark:text-base-300">
                 {expense.paymentMethod && (
                    <div className="flex items-center">
                        <CreditCardIcon className="h-4 w-4 mr-1.5" />
                        <span>{expense.paymentMethod}</span>
                    </div>
                 )}
                 {!expense.paymentMethod && <div />}
                <div className="flex items-center">
                    <CalendarDaysIcon className="h-4 w-4 mr-1.5" />
                    <span>{new Date(expense.date).toLocaleDateString('en-US', {timeZone: 'UTC'})}</span>
                </div>
            </div>
        </div>
        <div className="flex space-x-1 pl-2">
            <button onClick={() => onEdit(expense)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors" aria-label="Edit expense">
            <PencilIcon className="h-5 w-5" />
            </button>
            <button onClick={() => onDelete(expense.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete expense">
            <TrashIcon className="h-5 w-5" />
            </button>
        </div>
        </li>
    );
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete, displayCurrency, conversionRate }) => {
  const [expenseToDeleteId, setExpenseToDeleteId] = useState<string | null>(null);

  const handleConfirmDelete = () => {
    if (expenseToDeleteId) {
      onDelete(expenseToDeleteId);
      setExpenseToDeleteId(null);
    }
  };

  return (
    <>
      <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-base-content dark:text-base-100">Recent Expenses</h2>
        {expenses.length > 0 ? (
          <ul className="space-y-4">
            {expenses.map(expense => (
              <ExpenseItem 
                key={expense.id} 
                expense={expense} 
                onEdit={onEdit} 
                onDelete={setExpenseToDeleteId}
                displayCurrency={displayCurrency}
                conversionRate={conversionRate}
              />
            ))}
          </ul>
        ) : (
          <div className="text-center py-10">
            <p className="text-base-content-secondary dark:text-base-300">No expenses yet.</p>
            <p className="text-sm text-base-content-secondary dark:text-gray-500">Click the '+' button to add your first expense!</p>
          </div>
        )}
      </div>
      
      <ConfirmationDialog
        isOpen={!!expenseToDeleteId}
        onClose={() => setExpenseToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
      >
        Are you sure you want to delete this expense? This action cannot be undone.
      </ConfirmationDialog>
    </>
  );
};

export default ExpenseList;
