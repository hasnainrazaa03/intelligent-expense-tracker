import { useEffect, useEffectEvent, useRef } from 'react';

type Preloadable = { preload: () => void };

/**
 * Once signed in, fetch the other screens' code while the browser is idle, so
 * they still open after the connection drops (C15). Skipped offline and on
 * data-saver. Keep heavy screens (Reports, the data dialog: 180 kB of PDF
 * library) out of the list; they load on demand.
 */
export const useIdlePrefetch = (enabled: boolean, screens: Preloadable[]) => {
  const screensRef = useRef(screens);
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!navigator.onLine || saveData) return;
      screensRef.current.forEach((screen) => screen.preload());
    };
    // Safari has no requestIdleCallback; fall back to a short delay there.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 8000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 4000);
    return () => clearTimeout(id);
  }, [enabled]);
};

/**
 * Ctrl/Cmd+N opens a new entry. The listener calls the latest handler (an
 * effect event), so it isn't re-attached on every render. No Escape handling
 * here: each dialog closes on Escape through its own onClose (F13).
 */
export const useNewEntryShortcut = (enabled: boolean, open: () => void) => {
  const openLatest = useEffectEvent(open);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openLatest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
};
