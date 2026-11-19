import React, { useEffect, useRef, useState } from 'react';
import { PlusIcon } from '../Icons';

/**
 * "Add" and its menu: add an expense, add income, or scan a statement (U2a).
 * On a laptop it's a button in the header; on a phone it's the + in the middle
 * of the bottom bar. It replaces the floating + button, which sat on top of
 * whatever was under it.
 *
 * Keyboard (4b): opening moves focus to the first item; arrows, Home and End
 * move through it; Escape closes it and returns focus to the button; Tab
 * closes it.
 */
const AddMenu: React.FC<{
  placement: 'header' | 'bar';
  onAddExpense: () => void;
  onAddIncome: () => void;
  onScanStatement: () => void;
}> = ({ placement, onAddExpense, onAddIncome, onScanStatement }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = `add-menu-${placement}`;
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const choose = (action: () => void) => () => { setOpen(false); action(); };
  const item = 'w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-medium text-app-text hover:bg-surface-2 focus:bg-surface-2 focus:outline-none transition-colors';
  const isBar = placement === 'bar';

  return (
    <div className="relative flex justify-center">
      {open && (
        // Click-away backdrop
        <button aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
      )}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Add"
          onKeyDown={onMenuKey}
          className={`absolute z-50 w-64 modal-surface rounded-2xl p-2 space-y-0.5 animate-[fabpop_120ms_ease-out] ${
            isBar ? 'bottom-full mb-3 left-1/2 -translate-x-1/2 origin-bottom' : 'top-full mt-2 right-0 origin-top-right'
          }`}
        >
          <button role="menuitem" tabIndex={-1} onClick={choose(onAddExpense)} className={item}>+ Add expense</button>
          <button role="menuitem" tabIndex={-1} onClick={choose(onAddIncome)} className={item}>+ Add income</button>
          <div className="my-1 border-t border-app-border" />
          <button role="menuitem" tabIndex={-1} onClick={choose(onScanStatement)} className={item}>
            Scan a statement (CSV / PDF)
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Add new entry"
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        className={isBar
          ? 'relative z-50 grid place-items-center w-12 h-12 -mt-5 rounded-full bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-95 transition-all'
          : 'relative z-50 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold shadow-glow hover:brightness-110 active:scale-[0.99] transition-all'}
      >
        <PlusIcon className={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
        {!isBar && <span>Add</span>}
      </button>
    </div>
  );
};

export default AddMenu;
