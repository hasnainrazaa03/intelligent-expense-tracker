import React from 'react';
import { Button } from './ui';

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
        <Button onClick={onCta} className="mt-6 px-5" aria-label={ctaLabel}>
          {ctaLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
