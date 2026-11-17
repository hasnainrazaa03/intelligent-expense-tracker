import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'appTheme';

// The theme is per device (not an account setting) and shared by every
// component that shows it. It used to be per-component state, so a second
// toggle (Settings) and the header's button could disagree.
const read = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // storage unavailable
  }
  // Orbit is a cosmic dark-first product — default to dark unless the user has
  // explicitly chosen light before.
  return 'dark';
};

let current: Theme = typeof localStorage === 'undefined' ? 'dark' : read();
const listeners = new Set<() => void>();

const apply = (theme: Theme) => {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
};
if (typeof document !== 'undefined') apply(current);

export const setTheme = (theme: Theme) => {
  current = theme;
  apply(theme);
  listeners.forEach((fn) => fn());
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, () => current, () => current);
  const toggleTheme = () => setTheme(current === 'light' ? 'dark' : 'light');
  return { theme, toggleTheme, setTheme };
};
