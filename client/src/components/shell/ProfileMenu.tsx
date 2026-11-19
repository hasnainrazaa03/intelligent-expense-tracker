import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import CurrencyPicker from '../CurrencyPicker';
import { PATHS } from '../../app/routes';
import { ArrowDownTrayIcon, ArrowRightStartOnRectangleIcon, Cog6ToothIcon, TableCellsIcon, TagIcon } from '../Icons';

/**
 * The profile menu (U2a): who's signed in, the preferences that used to be
 * header icons (theme, display currency, hiding tuition), categories, import
 * and export, installing the app, Settings and signing out. A small panel,
 * not a full menu, because it holds a switch and the currency picker.
 */
const ProfileMenu: React.FC<{
  email: string | null;
  hideTuition: boolean;
  onToggleHideTuition: () => void;
  onManageCategories: () => void;
  onOpenData: () => void;
  onLogout: () => void;
}> = ({ email, hideTuition, onToggleHideTuition, onManageCategories, onOpenData, onLogout }) => {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { canInstall, promptInstall } = usePwaInstall();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = false) => { setOpen(false); if (refocus) button.current?.focus(); };
  const run = (action: () => void) => () => { close(); action(); };
  const initial = (email?.trim()[0] ?? '?').toUpperCase();
  const row = 'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-app-text text-left hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors';
  const switchCls = (on: boolean) => `relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors ${on ? 'bg-primary border-primary' : 'bg-surface-2 border-app-border'}`;
  const knob = (on: boolean) => `absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account and preferences"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="grid place-items-center w-10 h-10 rounded-full bg-primary-soft border border-primary/30 text-primary font-display font-bold text-sm hover:brightness-110 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {initial}
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Account and preferences"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } }}
          className="absolute right-0 top-full mt-2 z-50 w-[min(20rem,calc(100vw-1.5rem))] modal-surface rounded-2xl p-2 shadow-soft"
        >
          {email && (
            <div className="px-3 pt-2 pb-3 border-b border-app-border mb-1">
              <p className="text-[11px] uppercase tracking-[0.14em] text-app-muted">Signed in as</p>
              <p className="text-sm font-semibold text-app-text truncate">{email}</p>
            </div>
          )}
          {/* A switch named by its visible words (WCAG 2.5.3), on when dark. */}
          <button type="button" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme} className={row}>
            <span className="flex-1">Dark theme</span>
            <span className={switchCls(theme === 'dark')} aria-hidden="true"><span className={knob(theme === 'dark')} /></span>
          </button>
          <button type="button" role="switch" aria-checked={hideTuition} onClick={onToggleHideTuition} className={row}>
            <span className="flex-1">Hide tuition from summaries</span>
            <span className={switchCls(hideTuition)} aria-hidden="true"><span className={knob(hideTuition)} /></span>
          </button>
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 text-sm font-medium text-app-text">Display currency</span>
            <CurrencyPicker />
          </div>
          <div className="my-1 border-t border-app-border" />
          <button type="button" onClick={run(onManageCategories)} className={row}><TagIcon className="h-4 w-4 text-app-muted" /> Categories</button>
          <button type="button" onClick={run(onOpenData)} className={row}><TableCellsIcon className="h-4 w-4 text-app-muted" /> Import and export</button>
          {canInstall && (
            <button type="button" onClick={run(() => { void promptInstall(); })} className={row}><ArrowDownTrayIcon className="h-4 w-4 text-app-muted" /> Install the app</button>
          )}
          <Link to={PATHS.settings} onClick={() => close()} className={row}><Cog6ToothIcon className="h-4 w-4 text-app-muted" /> All settings</Link>
          <div className="my-1 border-t border-app-border" />
          <button type="button" onClick={run(onLogout)} className={`${row} !text-danger hover:!bg-danger/10`}><ArrowRightStartOnRectangleIcon className="h-4 w-4" /> Sign out</button>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
