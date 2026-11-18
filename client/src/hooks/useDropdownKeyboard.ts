import { useEffect, useEffectEvent, type RefObject } from 'react';

/**
 * Keyboard support for a dropdown inside a modal (a search box plus option
 * buttons), e.g. the category picker in the expense and income forms (4b).
 *
 * - Escape closes only the dropdown and returns focus to its toggle. It is
 *   caught in the capture phase, before the modal's focus trap sees it: that
 *   trap closes the whole modal, which threw away the half-filled form.
 * - ArrowDown / ArrowUp move between the search box and the options.
 */
export default function useDropdownKeyboard(
  isOpen: boolean,
  close: () => void,
  containerRef: RefObject<HTMLElement | null>,
  toggleId: string,
) {
  // The latest close handler, without re-attaching the listener each render.
  const closeLatest = useEffectEvent(close);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container || !container.contains(document.activeElement)) return;
      const toggle = document.getElementById(toggleId);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeLatest();
        toggle?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(container.querySelectorAll<HTMLElement>('input, button'))
        .filter((el) => el !== toggle && !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      e.preventDefault();
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, containerRef, toggleId]);
}
