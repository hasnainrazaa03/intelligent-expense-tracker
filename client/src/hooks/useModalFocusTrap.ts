import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function useModalFocusTrap<T extends HTMLElement>(
  isOpen: boolean,
  onRequestClose?: () => void
) {
  const modalRef = useRef<T | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  // Hold the latest close handler in a ref so the trap effect depends ONLY on
  // isOpen. Callers commonly pass an inline onClose whose identity changes every
  // render (e.g. a `handleRequestClose` closure); if that were an effect dep,
  // typing in any modal field would re-run this effect and yank focus back to
  // the first focusable element (the ✕ button) after the first keystroke.
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    lastActiveElementRef.current = document.activeElement as HTMLElement;
    const container = modalRef.current;

    const focusableNodes = Array.from(container.querySelectorAll(FOCUSABLE)) as HTMLElement[];
    if (focusableNodes.length > 0) {
      focusableNodes[0].focus();
    } else {
      container.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRequestCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const nodes = Array.from(container.querySelectorAll(FOCUSABLE)) as HTMLElement[];
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement as HTMLElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      lastActiveElementRef.current?.focus();
    };
  }, [isOpen]);

  return modalRef;
}
