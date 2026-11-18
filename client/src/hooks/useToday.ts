import { useEffect, useState } from 'react';
import { todayCalendar } from '../utils/dateUtils';

/** Milliseconds from `now` until just after the next local midnight. */
export const msUntilNextDay = (now: Date = new Date()): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime() - now.getTime();

/**
 * Today's local calendar day (`YYYY-MM-DD`), kept in state and moved on at
 * midnight. Components derive "this month", "the last 30 days" and so on from
 * it instead of calling `new Date()` while rendering: that was impure (React
 * Compiler readiness), and a screen left open overnight kept showing
 * yesterday's periods until something else re-rendered it.
 */
export const useToday = (): string => {
  const [today, setToday] = useState(todayCalendar);
  useEffect(() => {
    // Also re-checks when the tab comes back: timers are throttled in the background.
    const check = () => setToday(todayCalendar());
    const timer = setTimeout(check, msUntilNextDay());
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [today]);
  return today;
};
