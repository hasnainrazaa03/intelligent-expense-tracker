import React, { useRef } from 'react';
import { ClipboardDocumentListIcon, TableCellsIcon, AcademicCapIcon, ChartPieIcon, BanknotesIcon, ChatBubbleBottomCenterTextIcon, Cog6ToothIcon } from '../Icons';
import type { ActiveView } from '../../app/useActiveView';

const VerticalTab: React.FC<{ icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    role="tab"
    aria-selected={isActive}
    aria-current={isActive ? 'page' : undefined}
    aria-label={label}
    title={label}
    className={`group relative flex items-center gap-3 w-full pl-[10px] pr-2 py-2.5 rounded-xl transition-colors flex-shrink-0 text-left
      ${isActive ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text hover:bg-surface-2'}`}
  >
    <span className={`flex-shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`}>{icon}</span>
    <span className="text-sm font-semibold tracking-tight whitespace-nowrap opacity-0 group-hover/nav:opacity-100 group-has-[:focus-visible]/nav:opacity-100 transition-opacity duration-150">{label}</span>
  </button>
);

const TABS: { view: ActiveView; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { view: 'expenses', label: 'Expenses', Icon: ClipboardDocumentListIcon },
  { view: 'income', label: 'Income', Icon: BanknotesIcon },
  { view: 'ai', label: 'AI Analyst', Icon: ChatBubbleBottomCenterTextIcon },
  { view: 'pivot', label: 'Pivot', Icon: TableCellsIcon },
  { view: 'reports', label: 'Reports', Icon: ChartPieIcon },
  { view: 'usc', label: 'Tuition', Icon: AcademicCapIcon },
  { view: 'settings', label: 'Settings', Icon: Cog6ToothIcon },
];

/** Desktop: a slim icon rail that expands to show labels on hover, and while a
 *  keyboard user is in it (not after a mouse click, or it would stay open over
 *  the page). Arrow keys, Home and End move between tabs. */
const SideNav: React.FC<{ activeView: ActiveView; onSelect: (view: ActiveView) => void }> = ({ activeView, onSelect }) => {
  const navRef = useRef<HTMLElement | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || !navRef.current) return;
    const tabs = Array.from(navRef.current.querySelectorAll('button')) as HTMLButtonElement[];
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (tabs.length === 0 || current === -1) return;
    e.preventDefault();
    if (e.key === 'Home') return tabs[0].focus();
    if (e.key === 'End') return tabs[tabs.length - 1].focus();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    tabs[(current + delta + tabs.length) % tabs.length].focus();
  };
  return (
    <div className="hidden md:block relative w-[64px] flex-shrink-0 h-full z-30">
      <nav
        ref={navRef}
        role="tablist"
        aria-label="Primary navigation"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="group/nav absolute left-0 top-0 h-full w-[64px] hover:w-52 hover:shadow-soft has-[:focus-visible]:w-52 has-[:focus-visible]:shadow-soft transition-[width] duration-200 ease-out flex flex-col gap-1 modal-surface rounded-2xl p-2 overflow-hidden"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted px-3 h-4 pt-1 mb-1 whitespace-nowrap opacity-0 group-hover/nav:opacity-100 group-has-[:focus-visible]/nav:opacity-100 transition-opacity duration-150">Menu</p>
        {TABS.map(({ view, label, Icon }) => (
          <VerticalTab key={view} icon={<Icon className="h-5 w-5" />} label={label} isActive={activeView === view} onClick={() => onSelect(view)} />
        ))}
      </nav>
    </div>
  );
};

export default SideNav;
