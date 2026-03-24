import React from 'react';

interface EmptyStateProps {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, ctaLabel, onCta }) => {
  return (
    <div className="border-4 border-ink border-dashed p-8 md:p-16 text-center bg-bone/50">
      <p className="font-loud text-lg md:text-2xl text-ink/40 uppercase">{title}</p>
      <p className="text-[10px] md:text-xs font-mono text-ink/60 mt-2 uppercase">{subtitle}</p>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="mt-5 px-5 py-2 border-4 border-ink bg-usc-gold text-ink font-loud text-xs uppercase shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          aria-label={ctaLabel}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
