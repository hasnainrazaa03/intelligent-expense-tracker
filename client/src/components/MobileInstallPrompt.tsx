import React, { useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';

/** A dismissible "install the app" nudge. Anchored bottom-left and width-capped
 *  so it never overlaps the bottom-right FAB or the desktop sidebar; the same
 *  install action also lives permanently in the header. */
const MobileInstallPrompt: React.FC = () => {
  const { canInstall, promptInstall } = usePwaInstall();
  const [hidden, setHidden] = useState(false);

  if (!canInstall || hidden) return null;

  return (
    <div className="fixed z-[60] bottom-24 md:bottom-6 left-3 md:left-20 w-[min(20rem,calc(100vw-6rem))] modal-surface rounded-2xl p-4 shadow-soft animate-in fade-in slide-in-from-bottom-2 duration-200">
      <p className="text-sm font-medium text-app-text">Install the Orbit mobile companion?</p>
      <p className="text-[11px] text-app-muted mt-1">Add Orbit to your home screen for quick, app-like access and offline support.</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => { promptInstall(); }}
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
