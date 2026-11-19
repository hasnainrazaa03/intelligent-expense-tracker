import React, { useRef, useState } from 'react';
import type { Expense, Income } from '../../types';
import type { Entry } from '../../utils/transactionsView';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { getCategoryColor } from '../../utils/colorUtils';
import { BanknotesIcon, ChatBubbleBottomCenterTextIcon, PencilIcon, TagIcon, TrashIcon } from '../Icons';

const SWIPE = 80;

/**
 * One compact row of the Transactions list (U4): what it was, its category and
 * account, the amount (income in green with a +). Click to edit; Edit and
 * Delete buttons on the right; double-click the amount to change it and the
 * note in place (USD display only, as before). On a phone, swipe left to
 * delete or right to edit. In select mode a checkbox leads the row.
 */
const TransactionRow: React.FC<{
  entry: Entry;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickSave: (next: Expense | Income) => Promise<void> | void;
}> = ({ entry, selectMode, selected, onToggle, onEdit, onDelete, onQuickSave }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { kind, item } = entry;
  const isIncome = kind === 'income';
  const noun = isIncome ? 'income' : 'expense';
  const color = isIncome ? 'var(--color-ok, #22c55e)' : getCategoryColor(item.category);

  const [editing, setEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const startQuickEdit = () => {
    if (displayCurrency !== 'USD') return onEdit();
    setDraftAmount(item.amount.toString());
    setDraftNotes(item.notes || '');
    setEditing(true);
  };
  const saveQuickEdit = async () => {
    const parsed = Number.parseFloat(draftAmount);
    if (Number.isFinite(parsed) && parsed > 0) await onQuickSave({ ...item, amount: parsed, notes: draftNotes.trim() || undefined });
    setEditing(false);
  };

  // Phones: a horizontal swipe past 80 px deletes (left) or edits (right).
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (selectMode || editing) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.touches[0].clientX - s.x;
    const my = e.touches[0].clientY - s.y;
    if (s.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.horizontal = Math.abs(mx) > Math.abs(my);
    if (s.horizontal) setDx(Math.max(-120, Math.min(120, mx)));
  };
  const onTouchEnd = () => {
    const moved = dx;
    start.current = null;
    setDx(0);
    if (moved <= -SWIPE) onDelete();
    else if (moved >= SWIPE) onEdit();
  };

  const meta = [item.category, item.account || (!isIncome ? (item as Expense).paymentMethod : undefined)].filter(Boolean).join(' · ');
  const amountText = `${isIncome ? '+' : ''}${formatCurrency(item.amount, displayCurrency, conversionRate)}`;
  const iconBtn = 'grid place-items-center w-8 h-8 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors';

  return (
    <li className="relative overflow-hidden rounded-xl">
      {dx !== 0 && (
        <div aria-hidden="true" className={`absolute inset-0 flex items-center px-4 text-xs font-semibold ${dx < 0 ? 'justify-end bg-danger/20 text-danger' : 'justify-start bg-primary/20 text-primary'}`}>
          {dx < 0 ? 'Delete' : 'Edit'}
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={`relative flex items-center gap-3 px-2.5 py-2 rounded-xl ${dx ? 'bg-surface' : 'transition-transform'} ${selected ? 'bg-primary-soft' : 'hover:bg-surface-2/60'}`}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${item.title}`}
            className="accent-[color:var(--primary)] w-4 h-4 flex-shrink-0"
          />
        )}
        <span
          aria-hidden="true"
          className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
          {isIncome ? <BanknotesIcon className="h-4 w-4" /> : <TagIcon className="h-4 w-4" />}
        </span>
        <button
          type="button"
          onClick={selectMode ? onToggle : onEdit}
          tabIndex={-1}
          className="min-w-0 flex-1 text-left focus:outline-none"
        >
          <span className="block text-sm font-medium text-app-text truncate">{item.title}</span>
          <span className="block text-[11px] text-app-muted truncate">{meta}</span>
          {item.notes && !editing && (
            <span className="block text-[11px] text-app-faint truncate">
              <ChatBubbleBottomCenterTextIcon className="h-3 w-3 inline mr-1 text-primary" />{item.notes}
            </span>
          )}
        </button>
        {editing ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input
              aria-label={`Amount in USD for ${item.title}`}
              placeholder="USD"
              type="number"
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
              className="w-24 bg-surface-2 border border-app-border rounded-lg px-2 py-1 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              aria-label={`Note for ${item.title}`}
              placeholder="Note"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              className="hidden sm:block w-36 bg-surface-2 border border-app-border rounded-lg px-2 py-1 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button type="button" onClick={() => { void saveQuickEdit(); }} aria-label={`Save quick edit for ${item.title}`} className="text-xs font-semibold text-on-primary bg-primary rounded-lg px-2.5 py-1.5">Save</button>
          </div>
        ) : (
          <span
            onDoubleClick={startQuickEdit}
            className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isIncome ? 'text-ok' : 'text-app-text'}`}
          >
            {amountText}
          </span>
        )}
        {!selectMode && !editing && (
          <span className="flex items-center flex-shrink-0">
            <button type="button" onClick={onEdit} aria-label={`Edit ${noun} ${item.title}`} className={iconBtn}><PencilIcon className="h-4 w-4" /></button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${noun} ${item.title}`} className={`${iconBtn} hover:!text-danger`}><TrashIcon className="h-4 w-4" /></button>
          </span>
        )}
      </div>
    </li>
  );
};

export default TransactionRow;
