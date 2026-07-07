import React from 'react';

interface EmptyStateProps {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, ctaLabel, onCta }) => {
  return (
    <div className="glass rounded-2xl border-dashed p-10 md:p-16 text-center">
      <p className="font-display text-lg md:text-xl font-semibold text-app-text">{title}</p>
      <p className="text-sm text-app-muted mt-2 max-w-sm mx-auto">{subtitle}</p>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="mt-6 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-glow hover:brightness-110 active:scale-[0.99] transition-all"
          aria-label={ctaLabel}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
