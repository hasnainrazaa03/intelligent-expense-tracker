import React, { useState } from 'react';
import { Expense } from '../types';
import { getCategoryColor } from '../utils/colorUtils';
import { 
  PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, 
  CreditCardIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon 
} from './Icons';
import { formatCurrency } from '../utils/currencyUtils';
import Pagination from './Pagination';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

// --- TYPES FOR SUB-COMPONENTS ---
interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
}

interface ExpenseItemProps {
    expense: Expense;
    onEdit: (e: Expense) => void;
    onDelete: (id: string) => void;
    displayCurrency: 'USD' | 'INR';
    conversionRate: number | null;
}

// --- NEO-BRUTALIST CONFIRMATION DIALOG ---
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[110] flex justify-center items-center p-4" onClick={onClose}>
          <div className="bg-bone border-4 border-ink shadow-neo-cardinal w-full max-w-sm transform transition-all" onClick={e => e.stopPropagation()}>
              <div className="p-4 md:p-6 border-b-4 border-ink bg-usc-cardinal text-bone flex items-center">
                  <ExclamationTriangleIcon className="h-6 w-6 md:h-8 md:w-8 mr-3 flex-shrink-0" />
                  <h3 className="font-loud text-lg md:text-2xl uppercase leading-none">{title}</h3>
              </div>
              <div className="p-6 md:p-8 font-bold text-ink text-sm md:text-base uppercase leading-tight">
                  {children}
              </div>
              <div className="flex p-3 md:p-4 border-t-4 border-ink gap-3 md:gap-4 bg-bone">
                <button onClick={onClose} className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-white text-ink shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all">
                  CANCEL
                </button>
                <button onClick={onConfirm} className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-usc-cardinal text-bone shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all uppercase">
                  CONFIRM
                </button>
              </div>
          </div>
      </div>
  );
}

// --- NEO-BRUTALIST EXPENSE ITEM ---
const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onDelete, displayCurrency, conversionRate }) => {
    const categoryColor = getCategoryColor(expense.category);

    return (
        <li className="relative group">
          <div className="bg-white border-4 border-ink p-4 md:p-6 shadow-neo hover:shadow-neo-hover active:translate-y-0.5 md:hover:-translate-y-1 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 overflow-hidden">
              
              <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                  <div 
                      className="p-2 md:p-3 border-2 md:border-4 border-ink shadow-[2px_2px_0px_0px_#111111] md:shadow-[4px_4px_0px_0px_#111111] flex-shrink-0"
                      style={{ backgroundColor: categoryColor }}
                  >
                      <TagIcon className="h-4 w-4 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                      <h4 className="font-loud text-base md:text-xl leading-none text-ink truncate uppercase">{expense.title}</h4>
                      <div className="flex flex-wrap gap-1.5 md:gap-2 mt-2">
                          <span className="bg-ink text-bone px-1.5 py-0.5 text-[8px] md:text-[10px] font-bold border border-ink uppercase">
                              {expense.category.toUpperCase()}
                          </span>
                          <span className="flex items-center text-[8px] md:text-[10px] font-bold text-ink/60 uppercase">
                              <CalendarDaysIcon className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" /> {expense.date}
                          </span>
                      </div>
                  </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 border-t-2 md:border-t-0 border-ink/10 pt-3 md:pt-0">
                  <div className="text-left md:text-right">
                      <p className="font-loud text-xl md:text-2xl text-ink leading-none">
                          {formatCurrency(expense.amount, displayCurrency, conversionRate)}
                      </p>
                      {expense.paymentMethod && (
                          <p className="text-[8px] md:text-[10px] font-mono text-ink/60 flex items-center md:justify-end font-bold uppercase mt-1">
                              <CreditCardIcon className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" /> {expense.paymentMethod}
                          </p>
                      )}
                  </div>

                  <div className="flex space-x-2 flex-shrink-0">
                      <button 
                          onClick={() => onEdit(expense)}
                          className="p-2 border-2 border-ink bg-usc-gold text-ink shadow-[2px_2px_0px_0px_#111111] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                      >
                          <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                      <button 
                          onClick={() => onDelete(expense.id)}
                          className="p-2 border-2 border-ink bg-usc-cardinal text-bone shadow-[2px_2px_0px_0px_#111111] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                      >
                          <TrashIcon className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                  </div>
              </div>
          </div>
          
          {expense.notes && (
              <div className="hidden md:group-hover:block absolute -top-12 left-1/2 -translate-x-1/2 bg-ink text-bone p-2 text-xs font-mono border-2 border-usc-gold z-20 whitespace-nowrap shadow-neo uppercase">
                <ChatBubbleBottomCenterTextIcon className="h-3 w-3 inline mr-1" />
                {expense.notes}
              </div>
          )}
      </li>
    );
}

const ITEMS_PER_PAGE = 10;

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete, displayCurrency, conversionRate }) => {
  const [expenseToDeleteId, setExpenseToDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [expenses.length]);

  const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE);
  const paginatedExpenses = expenses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleConfirmDelete = () => {
    if (expenseToDeleteId) {
      onDelete(expenseToDeleteId);
      setExpenseToDeleteId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between border-b-4 border-ink pb-2">
        <h2 className="font-loud text-2xl md:text-4xl text-ink uppercase truncate pr-4">RECENT_EXPENSES</h2>
        <span className="bg-ink text-usc-gold px-2 md:px-3 py-1 font-loud text-[10px] md:text-xs whitespace-nowrap">COUNT: {expenses.length}</span>
      </div>

      {expenses.length > 0 ? (
        <>
        <ul className="space-y-4 md:space-y-6">
          {paginatedExpenses.map(expense => (
            <ExpenseItem 
              key={expense.id} 
              expense={expense} 
              onEdit={onEdit} 
              onDelete={(id) => setExpenseToDeleteId(id)}
              displayCurrency={displayCurrency}
              conversionRate={conversionRate}
            />
          ))}
        </ul>

        <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={expenses.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        </>
      ) : (
        <div className="border-4 border-ink border-dashed p-8 md:p-16 text-center bg-bone/50">
          <p className="font-loud text-lg md:text-2xl text-ink/20 uppercase">NO_TXNS_DETECTED</p>
          <p className="text-[9px] md:text-xs font-mono text-ink/40 mt-2 italic uppercase">STATUS: AWAITING_INPUT...</p>
        </div>
      )}
      
      <ConfirmationDialog
        isOpen={!!expenseToDeleteId}
        onClose={() => setExpenseToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="DANGER_ZONE"
      >
        YOU ARE ABOUT TO PERMANENTLY ERASE THIS TRANSACTION. THIS ACTION CANNOT BE UNDONE. PROCEED?
      </ConfirmationDialog>
    </div>
  );
}

export default ExpenseList;