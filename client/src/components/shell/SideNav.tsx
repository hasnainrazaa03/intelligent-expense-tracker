import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Place } from '../../app/routes';
import { NAV_ITEMS, type NavItem } from './navItems';

const PIN_KEY = 'orbit:nav-pinned';
const readPinned = () => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } };

/**
 * Desktop navigation (U2a): Home, Transactions, Budgets, Insights, Tuition, and
 * Settings at the bottom, as real links with their words.
 *
 * At 1280 px and wider the labels always show. Narrower, it's an icon rail
 * that opens over the page on hover or while a keyboard user is in it (not
 * after a mouse click, or it would stay open), and "Keep menu open" pins it
 * open beside the page on this device.
 */
const SideNav: React.FC<{ place: Place }> = ({ place }) => {
  const [pinned, setPinned] = useState(readPinned);
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    try { localStorage.setItem(PIN_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  // Wide when pinned or on a wide screen; otherwise it widens over the page.
  const open = pinned ? 'w-52' : 'w-16 xl:w-52';
  const reveal = pinned ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 group-has-[:focus-visible]/nav:opacity-100 xl:opacity-100';

  const link = ({ place: p, label, to, Icon }: NavItem) => {
    const active = p === place;
    return (
      <li key={p}>
        <Link
          to={to}
          aria-current={active ? 'page' : undefined}
          className={`flex items-center gap-3 w-full pl-[12px] pr-2 py-2.5 rounded-xl transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
            ${active ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text hover:bg-surface-2'}`}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          <span className={`text-sm font-semibold tracking-tight whitespace-nowrap transition-opacity duration-150 ${reveal}`}>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className={`hidden md:block relative flex-shrink-0 h-full z-30 ${open}`}>
      <nav
        aria-label="Primary"
        className={`group/nav absolute left-0 top-0 h-full ${open} ${pinned ? '' : 'hover:w-52 hover:shadow-soft has-[:focus-visible]:w-52 has-[:focus-visible]:shadow-soft xl:shadow-none'} transition-[width] duration-200 ease-out flex flex-col modal-surface rounded-2xl p-2 overflow-hidden`}
      >
        <ul className="flex flex-col gap-1">{NAV_ITEMS.filter((i) => i.place !== 'settings').map(link)}</ul>
        <ul className="mt-auto flex flex-col gap-1 pt-2 border-t border-app-border">
          {link(NAV_ITEMS.find((i) => i.place === 'settings')!)}
          <li className="xl:hidden">
            <button
              type="button"
              onClick={togglePin}
              aria-pressed={pinned}
              className="flex items-center gap-3 w-full pl-[12px] pr-2 py-2 rounded-xl text-app-faint hover:text-app-text hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 flex-shrink-0 transition-transform ${pinned ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              <span className={`text-xs font-semibold whitespace-nowrap transition-opacity duration-150 ${reveal}`}>{pinned ? 'Collapse menu' : 'Keep menu open'}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default SideNav;
