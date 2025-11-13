import React, { useState } from 'react';
import { Income } from '../types';
import { PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon, BanknotesIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface IncomeListProps {
  incomes: Income[];
  onEdit: (income: Income) => void;
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
                <div className="p-6 text-base-content-secondary dark:text-base-300">{children}</div>
                <div className="flex justify-end p-4 bg-base-200/50 dark:bg-dark-300/50 rounded-b-lg space-x-3">
                    <button onClick={onClose} className="px-4 py-2 bg-base-100 dark:bg-dark-200 text-base-content dark:text-base-200 rounded-md hover:bg-base-300/70 dark:hover:bg-dark-100 border border-base-300 dark:border-dark-100 transition-colors">Cancel</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Delete</button>
                </div>
            </div>
        </div>
    );
};

const IncomeItem: React.FC<{ income: Income; onEdit: (income: Income) => void; onDelete: (id: string) => void; displayCurrency: 'USD' | 'INR'; conversionRate: number | null; }> = ({ income, onEdit, onDelete, displayCurrency, conversionRate }) => {
    return (
        <li className="flex items-start p-4 space-x-4 bg-base-100 dark:bg-dark-200 rounded-lg transition-shadow hover:shadow-md">
            <div className="flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center mt-1 bg-green-500/20 text-green-500">
                <BanknotesIcon className="h-6 w-6" />
            </div>
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-semibold text-base-content dark:text-base-100">{income.title}</h4>
                        <p className="text-sm text-green-600 dark:text-green-400 font-semibold">{income.category}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">+{formatCurrency(income.amount, displayCurrency, conversionRate)}</span>
                         {income.originalAmount && income.originalCurrency && (
                            <span className="text-xs text-base-content-secondary dark:text-base-300">
                                ({income.originalAmount.toFixed(2)} {income.originalCurrency})
                            </span>
                        )}
                    </div>
                </div>
                {income.notes && (
                    <div className="flex items-start mt-2 text-sm text-base-content-secondary dark:text-base-300">
                        <ChatBubbleBottomCenterTextIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        <p className="whitespace-pre-wrap">{income.notes}</p>
                    </div>
                )}
                <div className="flex justify-end items-end mt-2 text-sm text-base-content-secondary dark:text-base-300">
                    <div className="flex items-center">
                        <CalendarDaysIcon className="h-4 w-4 mr-1.5" />
                        <span>{new Date(income.date).toLocaleDateString('en-US', {timeZone: 'UTC'})}</span>
                    </div>
                </div>
            </div>
            <div className="flex space-x-1 pl-2">
                <button onClick={() => onEdit(income)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors" aria-label="Edit income"><PencilIcon className="h-5 w-5" /></button>
                <button onClick={() => onDelete(income.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete income"><TrashIcon className="h-5 w-5" /></button>
            </div>
        </li>
    );
};

const IncomeList: React.FC<IncomeListProps> = ({ incomes, onEdit, onDelete, displayCurrency, conversionRate }) => {
  const [incomeToDeleteId, setIncomeToDeleteId] = useState<string | null>(null);

  const handleConfirmDelete = () => {
    if (incomeToDeleteId) {
      onDelete(incomeToDeleteId);
      setIncomeToDeleteId(null);
    }
  };

  return (
    <>
      <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-base-content dark:text-base-100">Recent Income</h2>
        {incomes.length > 0 ? (
          <ul className="space-y-4">
            {incomes.map(income => (
              <IncomeItem key={income.id} income={income} onEdit={onEdit} onDelete={setIncomeToDeleteId} displayCurrency={displayCurrency} conversionRate={conversionRate} />
            ))}
          </ul>
        ) : (
          <div className="text-center py-10">
            <p className="text-base-content-secondary dark:text-base-300">No income yet.</p>
            <p className="text-sm text-base-content-secondary dark:text-gray-500">Click the '+' button to add your first income entry!</p>
          </div>
        )}
      </div>
      
      <ConfirmationDialog
        isOpen={!!incomeToDeleteId}
        onClose={() => setIncomeToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
      >
        Are you sure you want to delete this income entry? This action cannot be undone.
      </ConfirmationDialog>
    </>
  );
};

export default IncomeList;
