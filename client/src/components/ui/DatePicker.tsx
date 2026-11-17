import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { fieldClass } from './Field';
import { CalendarDaysIcon } from '../Icons';
import { parseCalendarDate, todayCalendar } from '../../utils/dateUtils';

interface DatePickerProps {
  /** 'YYYY-MM-DD' or '' */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  /** earliest selectable 'YYYY-MM-DD' */
  min?: string;
  placeholder?: string;
  'aria-label'?: string;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const keyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const keyOfDate = (d: Date) => keyOf(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (key: string, n: number) => {
  const d = parseCalendarDate(key);
  d.setDate(d.getDate() + n);
  return keyOfDate(d);
};
/** Same day in another month, clamped to that month's length (Jan 31 + 1 → Feb 28). */
const addMonths = (key: string, n: number) => {
  const d = parseCalendarDate(key);
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return keyOfDate(t);
};
const spoken = (key: string) =>
  parseCalendarDate(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Themed date picker replacing the browser-native <input type="date">, whose
 * popup calendar can't be styled beyond light/dark. Same contract (value is a
 * 'YYYY-MM-DD' string). The calendar renders in a body portal with fixed
 * positioning so it's never clipped inside a scrollable modal.
 *
 * Keyboard (F19): opening moves focus to the selected day (or today); arrows
 * move by day/week, Home/End to the week's ends, PageUp/PageDown by month
 * (Shift: by year); Enter/Space picks; Tab stays inside the calendar; Escape or
 * a pick returns focus to the field. Before, the calendar never got focus and,
 * rendered outside the modal, was unreachable with Tab.
 */
const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, id, className = '', required, min, placeholder = 'Select date', ...rest
}) => {
  const ariaLabel = rest['aria-label'];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthStart(value ? parseCalendarDate(value) : new Date()));
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // The day that holds keyboard focus (roving tabindex), and whether the next
  // render should move focus onto it (on open and after arrow-key moves only, so
  // pressing "Next month" keeps focus on that button).
  const [focusKey, setFocusKey] = useState('');
  const focusDayRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const today = todayCalendar();
  const clampMin = (key: string) => (min && key < min ? min : key);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  // On open, sync the visible month to the value and place the popover.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_H = 340;
    const below = window.innerHeight - r.bottom;
    const openUp = below < PANEL_H && r.top > below;
    setPos({
      top: openUp ? Math.max(8, r.top - PANEL_H - 6) : r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - 268),
      width: r.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const start = clampMin(value || today);
    setFocusKey(start);
    setView(monthStart(parseCalendarDate(start)));
    focusDayRef.current = true;
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture-phase Escape so we close ONLY the picker and stop the event before
    // it reaches an enclosing modal's focus trap (which would close the modal).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); }
    };
    const onScrollResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
    };
  }, [open]);

  const cells = useMemo(() => {
    const y = view.getFullYear(), m = view.getMonth();
    const lead = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const out: Array<{ day: number; key: string } | null> = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push({ day: d, key: keyOf(y, m, d) });
    return out;
  }, [view]);

  // Move focus onto the active day once it's rendered. preventScroll: the
  // picker closes on any scroll, so focusing must not scroll the page.
  useEffect(() => {
    if (!open || !focusDayRef.current || !pos) return;
    const btn = popRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusKey}"]`);
    if (btn) { btn.focus({ preventScroll: true }); focusDayRef.current = false; }
  }, [open, pos, focusKey, view]);

  // The one tabbable day: the focused day if it's in the shown month, else the
  // selected day, else the first selectable day of the month.
  const tabbableKey = useMemo(() => {
    const keys = cells.filter((c): c is { day: number; key: string } => !!c).map((c) => c.key);
    if (keys.includes(focusKey)) return focusKey;
    if (keys.includes(value)) return value;
    return keys.find((k) => !(min && k < min)) ?? keys[0];
  }, [cells, focusKey, value, min]);

  const onGridKey = (e: React.KeyboardEvent) => {
    const base = tabbableKey;
    const weekday = parseCalendarDate(base).getDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(base, -1),
      ArrowRight: () => addDays(base, 1),
      ArrowUp: () => addDays(base, -7),
      ArrowDown: () => addDays(base, 7),
      Home: () => addDays(base, -weekday),
      End: () => addDays(base, 6 - weekday),
      PageUp: () => addMonths(base, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(base, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = clampMin(move());
    setFocusKey(next);
    setView(monthStart(parseCalendarDate(next)));
    focusDayRef.current = true;
  };

  // Keep Tab inside the calendar: it's rendered in a body portal, outside the
  // modal's own focus trap.
  const onPopKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !popRef.current) return;
    const nodes = Array.from(popRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')).filter((n) => n.tabIndex >= 0);
    if (nodes.length === 0) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const shift = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  const label = value
    ? parseCalendarDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const disabled = (key: string) => (min ? key < min : false);
  const commit = (key: string) => { onChange(key); close(true); };
  const monthLabelId = `${id || 'date'}-month-label`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // The name includes the date shown, so it matches what's on screen
        // (WCAG 2.5.3); "Date" alone didn't.
        aria-label={ariaLabel ? `${ariaLabel}, ${value ? label : placeholder}` : undefined}
        className={cn(fieldClass, 'flex items-center justify-between gap-2 text-left', className)}
      >
        <span className={value ? 'text-app-text' : 'text-app-faint'}>{value ? label : placeholder}</span>
        <CalendarDaysIcon className={cn('h-4 w-4 flex-shrink-0 transition-colors', open ? 'text-primary' : 'text-app-muted')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={ariaLabel ? `Choose ${ariaLabel.toLowerCase()}` : 'Choose date'}
          onKeyDown={onPopKey}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-[200] w-[260px] modal-surface border border-app-border rounded-2xl shadow-soft p-3 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
              className="grid place-items-center w-7 h-7 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span id={monthLabelId} aria-live="polite" className="text-sm font-semibold text-app-text tabular-nums">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month"
              className="grid place-items-center w-7 h-7 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1" aria-hidden="true">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-app-faint uppercase">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5" role="group" aria-labelledby={monthLabelId} onKeyDown={onGridKey}>
            {cells.map((c, i) => c ? (
              <button
                key={c.key}
                type="button"
                data-day={c.key}
                tabIndex={c.key === tabbableKey ? 0 : -1}
                disabled={disabled(c.key)}
                onClick={() => commit(c.key)}
                aria-label={spoken(c.key)}
                aria-pressed={c.key === value}
                aria-current={c.key === today ? 'date' : undefined}
                className={cn(
                  'h-8 rounded-lg text-sm tabular-nums transition-colors',
                  c.key === value
                    ? 'bg-primary text-on-primary font-semibold shadow-glow'
                    : c.key === today
                      ? 'text-primary font-semibold ring-1 ring-primary/40 hover:bg-surface-2'
                      : 'text-app-text hover:bg-surface-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                {c.day}
              </button>
            ) : <div key={`e-${i}`} />)}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-border">
            <button type="button" onClick={() => commit(today)} className="text-xs font-semibold text-primary hover:underline">Today</button>
            {!required && value && (
              <button type="button" onClick={() => commit('')} className="text-xs text-app-muted hover:text-app-text">Clear</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DatePicker;
