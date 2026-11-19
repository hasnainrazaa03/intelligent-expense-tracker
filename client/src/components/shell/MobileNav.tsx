import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Place } from '../../app/routes';
import { EllipsisHorizontalIcon } from '../Icons';
import AddMenu from './AddMenu';
import { navItem, type NavItem } from './navItems';

const MORE: Place[] = ['budgets', 'tuition', 'settings'];

/**
 * Phones (U2a): Home, Transactions, the + (add an expense, income or a
 * statement), Insights, and More, which holds Budgets, Tuition and Settings.
 * Icons with their words; it replaces the old row of six small text tabs and
 * the floating + button.
 */
const MobileNav: React.FC<{
  place: Place;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onScanStatement: () => void;
}> = ({ place, onAddExpense, onAddIncome, onScanStatement }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (moreOpen) sheet.current?.querySelector<HTMLElement>('a')?.focus();
  }, [moreOpen]);
  const closeMore = (refocus: boolean) => { setMoreOpen(false); if (refocus) moreButton.current?.focus(); };

  const tab = ({ place: p, label, to, Icon }: NavItem) => (
    <Link
      to={to}
      aria-current={p === place ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-xl text-[11px] font-semibold transition-colors ${p === place ? 'text-primary' : 'text-app-muted hover:text-app-text'}`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
  const moreActive = MORE.includes(place);

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" onMouseDown={(e) => { if (e.target === e.currentTarget) closeMore(false); }}>
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div
            ref={sheet}
            role="dialog"
            aria-label="More"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeMore(true); } }}
            className="absolute left-3 right-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] modal-surface rounded-2xl p-2"
          >
            <ul className="flex flex-col gap-0.5">
              {MORE.map((p) => {
                const { label, to, Icon } = navItem(p);
                return (
                  <li key={p}>
                    <Link
                      to={to}
                      onClick={() => closeMore(false)}
                      aria-current={p === place ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold ${p === place ? 'bg-primary-soft text-primary' : 'text-app-text hover:bg-surface-2'}`}
                    >
                      <Icon className="h-5 w-5" /> {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass glass-blur border-t border-app-border grid grid-cols-5 items-end px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
      >
        {tab(navItem('home'))}
        {tab(navItem('transactions'))}
        <AddMenu placement="bar" onAddExpense={onAddExpense} onAddIncome={onAddIncome} onScanStatement={onScanStatement} />
        {tab(navItem('insights'))}
        <button
          ref={moreButton}
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-xl text-[11px] font-semibold transition-colors ${moreActive || moreOpen ? 'text-primary' : 'text-app-muted hover:text-app-text'}`}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
};

export default MobileNav;
