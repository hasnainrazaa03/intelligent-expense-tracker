import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

const UNDO_WINDOW_MS = 5000;
// The toast must outlive the deletion window, or the UNDO button can vanish at
// the exact instant the delete fires (CMP-M19).
const TOAST_DURATION_MS = UNDO_WINDOW_MS + 600;

/**
 * Schedules a delete after a short undo window and shows an UNDO toast. Shared by
 * ExpenseList and IncomeList (previously duplicated with several lifecycle bugs):
 * - pending timers are cleared on unmount, so a delete never fires against an
 *   unmounted component and the UNDO stays reachable;
 * - the toast outlives the window;
 * - deletions are keyed by id, so a second delete doesn't silently no-op behind
 *   a global "isDeleting" flag.
 */
export default function useUndoableDelete(onDelete: (id: string) => Promise<void> | void) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return useCallback(
    (id: string, message = 'Scheduled for deletion.') => {
      // Collapse a re-scheduled delete of the same id.
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        timers.current.delete(id);
        try {
          await onDelete(id);
        } catch {
          // Errors are surfaced by the caller's onDelete (toasts); nothing to do here.
        }
      }, UNDO_WINDOW_MS);
      timers.current.set(id, timer);

      toast(
        (t) => (
          <div className="font-mono text-xs uppercase flex items-center gap-2">
            <span>{message}</span>
            <button
              onClick={() => {
                const active = timers.current.get(id);
                if (active) clearTimeout(active);
                timers.current.delete(id);
                toast.dismiss(t.id);
              }}
              className="border border-white px-2 py-0.5 font-bold"
            >
              UNDO
            </button>
          </div>
        ),
        { duration: TOAST_DURATION_MS }
      );
    },
    [onDelete]
  );
}
