import React, { useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Income } from '../types';
import { 
  PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, 
  ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon, BanknotesIcon 
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

interface IncomeListProps {
  incomes: Income[];
  onEdit: (income: Income) => void;
  onQuickSave?: (income: Income) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onCreate?: () => void;
  isLoading?: boolean;
  /** Optional date-range control rendered in the list header. */
  dateFilter?: React.ReactNode;
}

interface IncomeItemProps {
  income: Income;
  onEdit: (i: Income) => void;
  onQuickSave?: (income: Income) => Promise<void> | void;
  onDelete: (id: string) => void;
}

const IncomeItem: React.FC<IncomeItemProps> = ({ income, onEdit, onQuickSave, onDelete }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState(income.amount.toString());
  const [draftSource, setDraftSource] = useState(income.title);

  React.useEffect(() => {
    setDraftAmount(income.amount.toString());
    setDraftSource(income.title);
  }, [income.amount, income.title]);

  const saveInlineChanges = async () => {
    const parsed = Number.parseFloat(draftAmount);
    if (!Number.isFinite(parsed) || parsed <= 0 || !onQuickSave) {
      setIsInlineEditing(false);
      return;
    }
    await onQuickSave({ ...income, amount: parsed, title: draftSource.trim() || income.title });
    setIsInlineEditing(false);
  };

  return (
    <li className="relative group">
      <div className="glass rounded-2xl p-4 md:p-5 hover:border-app-border-strong transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 overflow-hidden">

        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
          <div className="grid place-items-center w-10 h-10 md:w-11 md:h-11 rounded-xl bg-ok/15 text-ok flex-shrink-0">
            <BanknotesIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {isInlineEditing ? (
              <input
                type="text"
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                className="bg-surface-2 border border-app-border rounded-lg px-2.5 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            ) : (
              <h4 className="font-display text-sm md:text-base font-semibold leading-tight text-app-text truncate" onDoubleClick={() => { displayCurrency === 'USD' ? setIsInlineEditing(true) : onEdit(income); }}>{income.title}</h4>
            )}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-1.5">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ok/15 text-ok">
                {income.category}
              </span>
              <span className="flex items-center text-[11px] text-app-muted">
                <CalendarDaysIcon className="h-3 w-3 mr-1" /> {income.date}
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
              <p className="font-display text-lg md:text-xl font-bold text-ok leading-none tabular-nums cursor-default" onDoubleClick={() => { displayCurrency === 'USD' ? setIsInlineEditing(true) : onEdit(income); }}>
                +{formatCurrency(income.amount, displayCurrency, conversionRate)}
              </p>
            )}
            <p className="text-[11px] text-app-muted mt-1">Verified inflow</p>
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            {isInlineEditing && (
              <Button variant="primary" size="sm" onClick={saveInlineChanges} aria-label={`Save quick edit for ${income.title}`} className="px-3 h-9 rounded-xl">
                Save
              </Button>
            )}
            <IconButton onClick={() => onEdit(income)} aria-label={`Edit income ${income.title}`}>
              <PencilIcon className="h-4 w-4" />
            </IconButton>
            <IconButton tone="danger" onClick={() => onDelete(income.id)} aria-label={`Delete income ${income.title}`}>
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </div>

      {income.notes && (
        <div className="hidden md:group-hover:block absolute -top-10 left-1/2 -translate-x-1/2 glass glass-blur rounded-lg px-3 py-2 text-xs text-app-text z-20 whitespace-nowrap max-w-xs truncate">
           <ChatBubbleBottomCenterTextIcon className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
           {income.notes}
        </div>
      )}
    </li>
  );
};

interface VirtualRowData {
  incomes: Income[];
  onEdit: (income: Income) => void;
  onQuickSave?: (income: Income) => Promise<void> | void;
  onDelete: (id: string) => void;
}

const VirtualIncomeRow: React.FC<RowComponentProps<VirtualRowData>> = ({ index, style, incomes, onEdit, onQuickSave, onDelete }) => {
  const income = incomes[index];
  return (
    <div style={style} className="pr-2 pb-4">
      <IncomeItem
        income={income}
        onEdit={onEdit}
        onQuickSave={onQuickSave}
        onDelete={onDelete}
      />
    </div>
  );
};

const IncomeList: React.FC<IncomeListProps> = ({ incomes, onEdit, onQuickSave, onDelete, onCreate, isLoading = false, dateFilter }) => {
  const [incomeToDeleteId, setIncomeToDeleteId] = useState<string | null>(null);
  const scheduleDelete = useUndoableDelete(onDelete);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<PageSizeOption>(APP_CONFIG.defaultItemsPerPage as PageSizeOption);

  const shouldVirtualize = incomes.length >= APP_CONFIG.maxVirtualizedItemsThreshold;
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: APP_CONFIG.virtualRowHeight });

  React.useEffect(() => {
    setCurrentPage(1);
  }, [incomes.length]);

  const totalPages = Math.ceil(incomes.length / itemsPerPage);
  const paginatedIncomes = incomes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleConfirmDelete = () => {
    if (!incomeToDeleteId) return;
    const idToDelete = incomeToDeleteId;
    setIncomeToDeleteId(null);
    scheduleDelete(idToDelete, 'Income scheduled for deletion.');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-app-border pb-3 gap-2">
        <h2 className="font-display text-xl md:text-2xl font-bold text-app-text truncate">Income stream</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {dateFilter}
          {!shouldVirtualize && (
            <select
              aria-label="Income rows per page"
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
          <span className="bg-surface-2 border border-app-border text-app-muted px-2.5 py-1.5 rounded-lg text-xs font-medium w-fit tabular-nums">
            {incomes.length} sources
          </span>
        </div>
      </div>

      {isLoading ? (
        <SectionSkeleton title="Loading income" rows={4} />
      ) : incomes.length > 0 ? (
        <>
        {shouldVirtualize ? (
          <div className="glass rounded-2xl p-2">
            <List
              defaultHeight={APP_CONFIG.virtualListHeight}
              style={{ height: APP_CONFIG.virtualListHeight }}
              rowCount={incomes.length}
              rowHeight={rowHeight}
              rowComponent={VirtualIncomeRow}
              rowProps={{
                incomes,
                onEdit,
                onQuickSave,
                onDelete: (id: string) => setIncomeToDeleteId(id),
              }}
            >
              {null}
            </List>
          </div>
        ) : (
          <>
            <ul className="space-y-4 md:space-y-6">
              {paginatedIncomes.map(income => (
                <IncomeItem 
                  key={income.id} 
                  income={income} 
                  onEdit={onEdit} 
                  onQuickSave={onQuickSave}
                  onDelete={(id) => setIncomeToDeleteId(id)}
                />
              ))}
            </ul>
            <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={incomes.length}
                itemsPerPage={itemsPerPage}
              />
          </>
        )}
        </>
      ) : (
        <EmptyState
          title="No income yet"
          subtitle="Add your first income entry to start tracking inflow."
          ctaLabel="Add first income"
          onCta={onCreate}
        />
      )}

      <ConfirmationDialog
        isOpen={!!incomeToDeleteId}
        onClose={() => setIncomeToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete income?"
      >
        This income record will be permanently deleted. This action cannot be undone.
      </ConfirmationDialog>
    </div>
  );
};

export default IncomeList;