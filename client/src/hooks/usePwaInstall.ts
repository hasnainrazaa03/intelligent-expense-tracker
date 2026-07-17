import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// The `beforeinstallprompt` event fires once and its prompt can only be used
// once, so capture it in a module-level singleton and fan it out to every
// subscriber (the nav button AND the popup) instead of racing two listeners.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** Shared PWA install state — `canInstall` is true once the browser has offered
 *  installation; `promptInstall()` shows the native prompt and resolves with the
 *  user's choice. */
export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(() => !!deferred);

  useEffect(() => {
    const l = () => setCanInstall(!!deferred);
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    emit();
    return choice.outcome;
  };

  return { canInstall, promptInstall };
}
