import { useEffect, useState } from 'react';

export const ACTIVE_VIEWS = ['expenses', 'income', 'ai', 'pivot', 'usc', 'reports', 'settings'] as const;
export type ActiveView = (typeof ACTIVE_VIEWS)[number];
const ACTIVE_VIEW_KEY = 'orbit:active-view';

/**
 * The screen on show. Remembered per browser tab (sessionStorage), so a
 * reload, including the automatic one after a deploy or a reconnect (C15),
 * returns to it instead of dropping the user back on Expenses.
 */
export const useActiveView = () => {
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    try {
      const saved = sessionStorage.getItem(ACTIVE_VIEW_KEY);
      return saved && (ACTIVE_VIEWS as readonly string[]).includes(saved) ? (saved as ActiveView) : 'expenses';
    } catch { return 'expenses'; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_VIEW_KEY, activeView); } catch { /* storage unavailable */ }
  }, [activeView]);
  return [activeView, setActiveView] as const;
};
