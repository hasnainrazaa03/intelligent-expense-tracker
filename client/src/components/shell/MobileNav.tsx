import React from 'react';
import type { ActiveView } from '../../app/useActiveView';

const ITEMS: { view: ActiveView; label: string }[] = [
  { view: 'expenses', label: 'Spend' },
  { view: 'income', label: 'Income' },
  { view: 'pivot', label: 'Pivot' },
  { view: 'ai', label: 'AI' },
  { view: 'reports', label: 'Reports' },
  { view: 'usc', label: 'Tuition' },
];

/** Phones: the bottom bar. Settings is the header's gear. */
const MobileNav: React.FC<{ activeView: ActiveView; onSelect: (view: ActiveView) => void }> = ({ activeView, onSelect }) => (
  <nav aria-label="Primary" className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass glass-blur border-t border-app-border grid grid-cols-6 px-1 pt-1.5 pb-2">
    {ITEMS.map(({ view, label }) => (
      <button
        key={view}
        onClick={() => onSelect(view)}
        aria-current={activeView === view ? 'page' : undefined}
        className={`py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${activeView === view ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
      >
        {label}
      </button>
    ))}
  </nav>
);

export default MobileNav;
