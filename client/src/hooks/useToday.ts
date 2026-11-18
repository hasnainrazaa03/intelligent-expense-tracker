import { useSyncExternalStore } from 'react';
import { todayCalendar } from '../utils/dateUtils';

/** Milliseconds from `now` until just after the next local midnight. */
export const msUntilNextDay = (now: Date = new Date()): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime() - now.getTime();

// One store for the whole app: one clock check, however many components ask.
// It checks once a minute and whenever the page is shown or focused again:
// timers don't count time asleep, so a laptop opened in the morning would
// otherwise keep yesterday until its long midnight timer caught up.
let today = todayCalendar();
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

const check = () => {
  const now = todayCalendar();
  if (now === today) return;
  today = now;
  listeners.forEach((fn) => fn());
};

const start = () => {
  check();
  const interval = setInterval(check, 60_000);
  const midnight = setTimeout(check, msUntilNextDay());
  const events = ['visibilitychange', 'focus', 'pageshow'] as const;
  events.forEach((e) => window.addEventListener(e, check));
  return () => {
    clearInterval(interval);
    clearTimeout(midnight);
    events.forEach((e) => window.removeEventListener(e, check));
  };
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  if (!stop) stop = start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
};

const getSnapshot = () => today;

/**
 * Today's local calendar day (`YYYY-MM-DD`), moved on at midnight. Components
 * derive "this month", "the last 30 days" and so on from it instead of calling
 * `new Date()` while rendering: that was impure (React Compiler readiness), and
 * a screen left open overnight kept showing yesterday's periods.
 */
export const useToday = (): string => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
