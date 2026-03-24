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
    <div className="fixed bottom-3 left-3 right-3 z-50 border-4 border-ink bg-usc-gold p-3 shadow-neo md:max-w-sm md:left-auto">
      <p className="font-loud text-[10px] uppercase">Install USC Ledger Mobile Companion?</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={async () => {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
          }}
          className="px-3 py-1 border-2 border-ink bg-ink text-bone font-loud text-[10px] uppercase"
        >
          Install
        </button>
        <button
          onClick={() => setHidden(true)}
          className="px-3 py-1 border-2 border-ink bg-white text-ink font-loud text-[10px] uppercase"
        >
          Later
        </button>
      </div>
    </div>
  );
};

export default MobileInstallPrompt;
