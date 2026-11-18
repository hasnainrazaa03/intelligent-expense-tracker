import React, { useEffect, useRef, useState } from 'react';
import { PlusCircleIcon } from '../Icons';

/**
 * The floating + button and its menu (4b): opening moves focus to the first
 * item; arrows, Home and End move through it; Escape closes it and returns
 * focus to the button; Tab closes it.
 *
 * It steps out of the way while the page scrolls down (it used to sit on top of
 * whatever was under it, like a budget amount or the date filter) and comes
 * back on the way up, near the top, or while it has focus or its menu is open.
 */
const QuickActions: React.FC<{ onAddExpense: () => void; onAddIncome: () => void; onScanStatement: () => void }> = ({
  onAddExpense,
  onAddIncome,
  onScanStatement,
}) => {
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll events don't bubble, so listen in the capture phase: the app
    // scrolls inside <main>, not the window.
    let last = 0;
    const onScroll = (e: Event) => {
      const el = e.target instanceof HTMLElement ? e.target : document.scrollingElement;
      if (!el || (el instanceof HTMLElement && el.id !== 'main-content' && el !== document.scrollingElement)) return;
      const y = el.scrollTop;
      const delta = y - last;
      last = y;
      if (wrapRef.current?.contains(document.activeElement)) return setTucked(false);
      if (y < 40) setTucked(false);
      else if (delta > 8) setTucked(true);
      else if (delta < -8) setTucked(false);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);
  const hidden = tucked && !open;
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
  const item = 'w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-medium text-app-text hover:bg-surface-2 transition-colors';

  return (
    <div
      ref={wrapRef}
      className={`fixed bottom-24 right-5 md:bottom-8 md:right-8 z-50 transition-all duration-200 ${hidden ? 'translate-y-28 opacity-0 pointer-events-none' : ''}`}
      onFocus={() => setTucked(false)}
    >
      {open && (
        // Click-away backdrop
        <button aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 -z-10 cursor-default" />
      )}
      {open && (
        <div
          ref={menuRef}
          id="quick-actions-menu"
          role="menu"
          aria-label="Quick actions"
          onKeyDown={onMenuKey}
          className="absolute bottom-16 right-0 w-56 modal-surface rounded-2xl p-2 space-y-0.5 origin-bottom-right animate-[fabpop_120ms_ease-out]"
        >
          <button role="menuitem" tabIndex={-1} onClick={choose(onAddExpense)} className={item}>+ Add expense</button>
          <button role="menuitem" tabIndex={-1} onClick={choose(onAddIncome)} className={item}>+ Add income</button>
          <div className="my-1 border-t border-app-border" />
          <button role="menuitem" tabIndex={-1} onClick={choose(onScanStatement)} className={`${item} flex items-center gap-2`}>
            <span aria-hidden="true">📄</span> Scan a statement (CSV / PDF)
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-controls={open ? 'quick-actions-menu' : undefined}
        aria-expanded={open}
        className="grid place-items-center w-14 h-14 rounded-full bg-primary text-on-primary shadow-glow hover:brightness-110 transition-all active:scale-95"
      >
        <PlusCircleIcon className={`h-7 w-7 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
    </div>
  );
};

export default QuickActions;
