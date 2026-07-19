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

/**
 * Themed date picker replacing the browser-native <input type="date">, whose
 * popup calendar can't be styled beyond light/dark. Same contract (value is a
 * 'YYYY-MM-DD' string). The calendar renders in a body portal with fixed
 * positioning so it's never clipped inside a scrollable modal.
 */
const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, id, className = '', required, min, placeholder = 'Select date', ...rest
}) => {
  const ariaLabel = rest['aria-label'];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthStart(value ? parseCalendarDate(value) : new Date()));
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const today = todayCalendar();

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
    if (value) setView(monthStart(parseCalendarDate(value)));
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
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); }
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

  const shift = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  const label = value
    ? parseCalendarDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const disabled = (key: string) => (min ? key < min : false);
  const commit = (key: string) => { onChange(key); setOpen(false); };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(fieldClass, 'flex items-center justify-between gap-2 text-left', className)}
      >
        <span className={value ? 'text-app-text' : 'text-app-faint'}>{value ? label : placeholder}</span>
        <CalendarDaysIcon className={cn('h-4 w-4 flex-shrink-0 transition-colors', open ? 'text-primary' : 'text-app-muted')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Choose date"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-[200] w-[260px] modal-surface border border-app-border rounded-2xl shadow-soft p-3 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
              className="grid place-items-center w-7 h-7 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-sm font-semibold text-app-text tabular-nums">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month"
              className="grid place-items-center w-7 h-7 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-app-faint uppercase">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => c ? (
              <button
                key={c.key}
                type="button"
                disabled={disabled(c.key)}
                onClick={() => commit(c.key)}
                aria-label={c.key}
                aria-current={c.key === value ? 'date' : undefined}
                className={cn(
                  'h-8 rounded-lg text-sm tabular-nums transition-colors',
                  c.key === value
                    ? 'bg-primary text-on-primary font-semibold shadow-glow'
                    : c.key === today
                      ? 'text-primary font-semibold ring-1 ring-primary/40 hover:bg-surface-2'
                      : 'text-app-text hover:bg-surface-2',
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
