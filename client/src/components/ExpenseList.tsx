import React, { useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
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
import { List, RowComponentProps, useDynamicRowHeight } from 'react-window';
import { APP_CONFIG, PAGE_SIZE_OPTIONS, PageSizeOption } from '../config';
import ConfirmationDialog from './ConfirmationDialog';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { Button, IconButton } from './ui';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onQuickSave?: (expense: Expense) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onCreate?: () => void;
  isLoading?: boolean;
  /** Optional date-range control rendered in the list header. */
  dateFilter?: React.ReactNode;
}

// --- TYPES FOR SUB-COMPONENTS ---
interface ExpenseItemProps {
    expense: Expense;
    onEdit: (e: Expense) => void;
  onQuickSave?: (expense: Expense) => Promise<void> | void;
    onDelete: (id: string) => void;
}

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onQuickSave, onDelete }) => {
    const { displayCurrency, conversionRate } = useCurrency();
    const categoryColor = getCategoryColor(expense.category);
    const [isInlineEditing, setIsInlineEditing] = useState(false);
    const [draftAmount, setDraftAmount] = useState(expense.amount.toString());
    const [draftNotes, setDraftNotes] = useState(expense.notes || '');

    React.useEffect(() => {
      setDraftAmount(expense.amount.toString());
      setDraftNotes(expense.notes || '');
    }, [expense.amount, expense.notes]);

    const saveInlineChanges = async () => {
      const parsed = Number.parseFloat(draftAmount);
      if (!Number.isFinite(parsed) || parsed <= 0 || !onQuickSave) {
        setIsInlineEditing(false);
        return;
      }
      await onQuickSave({ ...expense, amount: parsed, notes: draftNotes.trim() || undefined });
      setIsInlineEditing(false);
    };

    return (
        <li className="relative group">
          <div className="glass rounded-2xl p-4 md:p-5 hover:border-app-border-strong transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 overflow-hidden">

              <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                  <div
                      className="grid place-items-center w-10 h-10 md:w-11 md:h-11 rounded-xl flex-shrink-0"
                      style={{ backgroundColor: `color-mix(in srgb, ${categoryColor} 20%, transparent)` }}
                  >
                      <TagIcon className="h-5 w-5" style={{ color: categoryColor }} />
                  </div>
                  <div className="min-w-0">
                      <h4 className="font-display text-sm md:text-base font-semibold leading-tight text-app-text truncate">{expense.title}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-1.5">
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                            style={{ backgroundColor: `color-mix(in srgb, ${categoryColor} 18%, transparent)`, color: categoryColor }}
                          >
                              {expense.category}
                          </span>
                          <span className="flex items-center text-[11px] text-app-muted">
                              <CalendarDaysIcon className="h-3 w-3 mr-1" /> {expense.date}
                          </span>
                      </div>
                  </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 border-t md:border-t-0 border-app-border pt-3 md:pt-0">
                  <div className="text-left md:text-right">
                      {isInlineEditing ? (
                        <input
                          type="number"
                          value={draftAmount}
                          onChange={(e) => setDraftAmount(e.target.value)}
                          className="w-28 bg-surface-2 border border-app-border rounded-lg px-2.5 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      ) : (
                        <p className="font-display text-lg md:text-xl font-bold text-app-text leading-none tabular-nums cursor-default" onDoubleClick={() => { displayCurrency === 'USD' ? setIsInlineEditing(true) : onEdit(expense); }}>
                            {formatCurrency(expense.amount, displayCurrency, conversionRate)}
                        </p>
                      )}
                      {expense.paymentMethod && (
                          <p className="text-[11px] text-app-muted flex items-center md:justify-end mt-1">
                              <CreditCardIcon className="h-3 w-3 mr-1" /> {expense.paymentMethod}
                          </p>
                      )}
                      {isInlineEditing && (
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          className="mt-2 w-40 bg-surface-2 border border-app-border rounded-lg p-2 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="Quick note"
                        />
                      )}
                  </div>

                  <div className="flex gap-1.5 flex-shrink-0">
                      <IconButton
                          onClick={() => onEdit(expense)}
                          aria-label={`Edit expense ${expense.title}`}
                      >
                          <PencilIcon className="h-4 w-4" />
                      </IconButton>
                      {isInlineEditing && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={saveInlineChanges}
                          aria-label={`Save quick edit for ${expense.title}`}
                          className="px-3 h-9 rounded-xl"
                        >
                          Save
                        </Button>
                      )}
                      <IconButton
                          tone="danger"
                          onClick={() => onDelete(expense.id)}
                          aria-label={`Delete expense ${expense.title}`}
                      >
                          <TrashIcon className="h-4 w-4" />
                      </IconButton>
                  </div>
              </div>
          </div>

          {expense.notes && (
              <div className="hidden md:group-hover:block absolute -top-10 left-1/2 -translate-x-1/2 glass glass-blur rounded-lg px-3 py-2 text-xs text-app-text z-20 whitespace-nowrap max-w-xs truncate">
                <ChatBubbleBottomCenterTextIcon className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                {expense.notes}
              </div>
          )}
      </li>
    );
}

interface VirtualRowData {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onQuickSave?: (expense: Expense) => Promise<void> | void;
  onDelete: (id: string) => void;
}

const VirtualExpenseRow: React.FC<RowComponentProps<VirtualRowData>> = ({ index, style, expenses, onEdit, onQuickSave, onDelete }) => {
  const expense = expenses[index];
  return (
    <div style={style} className="pr-2 pb-4">
      <ExpenseItem
        expense={expense}
        onEdit={onEdit}
        onQuickSave={onQuickSave}
        onDelete={onDelete}
      />
    </div>
  );
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onQuickSave, onDelete, onCreate, isLoading = false, dateFilter }) => {
  const [expenseToDeleteId, setExpenseToDeleteId] = useState<string | null>(null);
  const scheduleDelete = useUndoableDelete(onDelete);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<PageSizeOption>(APP_CONFIG.defaultItemsPerPage as PageSizeOption);

  const shouldVirtualize = expenses.length >= APP_CONFIG.maxVirtualizedItemsThreshold;
  // CMP-H8: measured row heights (auto-observed by react-window) instead of one
  // fixed value — rows are taller on mobile (the card stacks) and vary with
  // content, so a single fixed height clipped/mis-sized them.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: APP_CONFIG.virtualRowHeight });

  React.useEffect(() => {
    setCurrentPage(1);
  }, [expenses.length]);

  const totalPages = Math.ceil(expenses.length / itemsPerPage);
  const paginatedExpenses = expenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleConfirmDelete = () => {
    if (!expenseToDeleteId) return;
    const idToDelete = expenseToDeleteId;
    setExpenseToDeleteId(null);
    scheduleDelete(idToDelete, 'Expense scheduled for deletion.');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-3">
        <h2 className="font-display text-xl md:text-2xl font-bold text-app-text truncate pr-4">Recent expenses</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {dateFilter}
          {!shouldVirtualize && (
            <select
              aria-label="Expenses per page"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value) as PageSizeOption);
                setCurrentPage(1);
              }}
              className="bg-surface-2 border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}/page</option>
              ))}
            </select>
          )}
          <span className="bg-surface-2 border border-app-border text-app-muted px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap tabular-nums">{expenses.length} total</span>
        </div>
      </div>

      {isLoading ? (
        <SectionSkeleton title="Loading expenses" rows={4} />
      ) : expenses.length > 0 ? (
        <>
        {shouldVirtualize ? (
          <div className="glass rounded-2xl p-2">
            <List
              defaultHeight={APP_CONFIG.virtualListHeight}
              style={{ height: APP_CONFIG.virtualListHeight }}
              rowCount={expenses.length}
              rowHeight={rowHeight}
              rowComponent={VirtualExpenseRow}
              rowProps={{
                expenses,
                onEdit,
                onQuickSave,
                onDelete: (id: string) => setExpenseToDeleteId(id),
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
                onQuickSave={onQuickSave}
                onDelete={(id) => setExpenseToDeleteId(id)}
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
          title="No expenses yet"
          subtitle="Start by logging your first expense to see it here."
          ctaLabel="Add first expense"
          onCta={onCreate}
        />
      )}

      <ConfirmationDialog
        isOpen={!!expenseToDeleteId}
        onClose={() => setExpenseToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete transaction?"
      >
        You're about to permanently delete this transaction. This action cannot be undone.
      </ConfirmationDialog>
    </div>
  );
}

export default ExpenseList;