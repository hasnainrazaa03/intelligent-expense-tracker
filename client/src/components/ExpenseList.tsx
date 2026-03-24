import React, { useState } from 'react';
import { Expense } from '../types';
import { getCategoryColor } from '../utils/colorUtils';
import { 
  PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, 
  CreditCardIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon 
} from './Icons';
import { formatCurrency } from '../utils/currencyUtils';
import Pagination from './Pagination';
import EmptyState from './EmptyState';
import SectionSkeleton from './SectionSkeleton';
import { List, RowComponentProps } from 'react-window';
import { APP_CONFIG, PAGE_SIZE_OPTIONS, PageSizeOption } from '../config';
import toast from 'react-hot-toast';
import ConfirmationDialog from './ConfirmationDialog';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => Promise<void> | void;
  onCreate?: () => void;
  isLoading?: boolean;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

// --- TYPES FOR SUB-COMPONENTS ---
interface ExpenseItemProps {
    expense: Expense;
    onEdit: (e: Expense) => void;
    onDelete: (id: string) => void;
    displayCurrency: 'USD' | 'INR';
    conversionRate: number | null;
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
                          aria-label={`Edit expense ${expense.title}`}
                          className="p-2 border-2 border-ink bg-usc-gold text-ink shadow-[2px_2px_0px_0px_#111111] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                      >
                          <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                      <button 
                          onClick={() => onDelete(expense.id)}
                          aria-label={`Delete expense ${expense.title}`}
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

interface VirtualRowData {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const VirtualExpenseRow: React.FC<RowComponentProps<VirtualRowData>> = ({ index, style, expenses, onEdit, onDelete, displayCurrency, conversionRate }) => {
  const expense = expenses[index];
  return (
    <div style={style} className="pr-2 pb-4">
      <ExpenseItem
        expense={expense}
        onEdit={onEdit}
        onDelete={onDelete}
        displayCurrency={displayCurrency}
        conversionRate={conversionRate}
      />
    </div>
  );
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete, onCreate, isLoading = false, displayCurrency, conversionRate }) => {
  const [expenseToDeleteId, setExpenseToDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<PageSizeOption>(APP_CONFIG.defaultItemsPerPage as PageSizeOption);

  const shouldVirtualize = expenses.length >= APP_CONFIG.maxVirtualizedItemsThreshold;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [expenses.length]);

  const totalPages = Math.ceil(expenses.length / itemsPerPage);
  const paginatedExpenses = expenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleConfirmDelete = async () => {
    if (expenseToDeleteId && !isDeleting) {
      const idToDelete = expenseToDeleteId;
      setExpenseToDeleteId(null);
      setIsDeleting(true);

      const deletionTimer = setTimeout(async () => {
        try {
          await onDelete(idToDelete);
        } finally {
          setIsDeleting(false);
        }
      }, 5000);

      toast((t) => (
        <div className="font-mono text-xs uppercase flex items-center gap-2">
          <span>Expense scheduled for deletion.</span>
          <button
            onClick={() => {
              clearTimeout(deletionTimer);
              setIsDeleting(false);
              toast.dismiss(t.id);
            }}
            className="border border-white px-2 py-0.5 font-bold"
          >
            UNDO
          </button>
        </div>
      ), { duration: 5000 });
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between border-b-4 border-ink pb-2">
        <h2 className="font-loud text-2xl md:text-4xl text-ink uppercase truncate pr-4">RECENT_EXPENSES</h2>
        <div className="flex items-center gap-2">
          {!shouldVirtualize && (
            <select
              aria-label="Expenses per page"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value) as PageSizeOption);
                setCurrentPage(1);
              }}
              className="border-2 border-ink bg-white px-2 py-1 font-mono text-[10px] md:text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}/page</option>
              ))}
            </select>
          )}
          <span className="bg-ink text-usc-gold px-2 md:px-3 py-1 font-loud text-[10px] md:text-xs whitespace-nowrap">COUNT: {expenses.length}</span>
        </div>
      </div>

      {isLoading ? (
        <SectionSkeleton title="Loading expenses" rows={4} />
      ) : expenses.length > 0 ? (
        <>
        {shouldVirtualize ? (
          <div className="border-4 border-ink bg-white">
            <List
              defaultHeight={APP_CONFIG.virtualListHeight}
              style={{ height: APP_CONFIG.virtualListHeight }}
              rowCount={expenses.length}
              rowHeight={APP_CONFIG.virtualRowHeight}
              rowComponent={VirtualExpenseRow}
              rowProps={{
                expenses,
                onEdit,
                onDelete: (id: string) => setExpenseToDeleteId(id),
                displayCurrency,
                conversionRate,
              }}
            >
              {null}
            </List>
          </div>
        ) : (
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
        )}

        {!shouldVirtualize && (
          <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={expenses.length}
              itemsPerPage={itemsPerPage}
            />
        )}
        </>
      ) : (
        <EmptyState
          title="NO_TXNS_DETECTED"
          subtitle="STATUS: AWAITING_INPUT... START BY LOGGING YOUR FIRST EXPENSE."
          ctaLabel="ADD_FIRST_EXPENSE"
          onCta={onCreate}
        />
      )}
      
      <ConfirmationDialog
        isOpen={!!expenseToDeleteId}
        onClose={() => setExpenseToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="DANGER_ZONE"
        loading={isDeleting}
      >
        YOU ARE ABOUT TO PERMANENTLY ERASE THIS TRANSACTION. THIS ACTION CANNOT BE UNDONE. PROCEED?
      </ConfirmationDialog>
    </div>
  );
}

export default ExpenseList;