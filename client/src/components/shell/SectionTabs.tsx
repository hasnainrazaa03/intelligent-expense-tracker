import React from 'react';
import { Link } from 'react-router-dom';

export interface SectionTab { label: string; to: string; active: boolean }

/**
 * The sections of a place (Insights: Reports, Breakdown, Income, Ask AI;
 * Transactions: Expenses, Income). Links, because each section has its own
 * address, styled as the app's segmented control.
 */
const SectionTabs: React.FC<{ label: string; tabs: SectionTab[] }> = ({ label, tabs }) => (
  <nav aria-label={label} className="max-w-full overflow-x-auto no-scrollbar">
    <ul className="flex items-center gap-1 bg-surface-2 border border-app-border rounded-xl p-1 w-fit">
      {tabs.map((t) => (
        <li key={t.to}>
          <Link
            to={t.to}
            aria-current={t.active ? 'page' : undefined}
            className={`block whitespace-nowrap px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${t.active ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
          >
            {t.label}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

export default SectionTabs;
