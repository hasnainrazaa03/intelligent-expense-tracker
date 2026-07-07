import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const MobileInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  if (!deferredPrompt || hidden) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 glass glass-blur rounded-2xl p-4 md:max-w-sm md:left-auto">
      <p className="text-sm font-medium text-app-text">Install the Orbit mobile companion?</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
          }}
          className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-glow hover:brightness-110 active:scale-[0.99] transition-all"
        >
          Install
        </button>
        <button
          onClick={() => setHidden(true)}
          className="px-4 py-2 rounded-xl bg-surface-2 border border-app-border text-app-text font-semibold text-sm hover:border-app-border-strong transition-all"
        >
          Later
        </button>
      </div>
    </div>
  );
};

export default MobileInstallPrompt;
