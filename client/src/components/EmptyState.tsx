import React from 'react';
import { Button } from './ui';

interface EmptyStateProps {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
  /** Secondary buttons (e.g. "Clear search", "Show all time"). */
  actions?: { label: string; onClick: () => void }[];
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, ctaLabel, onCta, actions = [] }) => {
  return (
    <div className="glass rounded-2xl border-dashed p-10 md:p-16 text-center">
      <p className="font-display text-lg md:text-xl font-semibold text-app-text">{title}</p>
      <p className="text-sm text-app-muted mt-2 max-w-sm mx-auto">{subtitle}</p>
      {(actions.length > 0 || (ctaLabel && onCta)) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {actions.map((a) => (
            <Button key={a.label} variant="secondary" onClick={a.onClick} className="px-5">{a.label}</Button>
          ))}
          {ctaLabel && onCta && (
            <Button onClick={onCta} className="px-5" aria-label={ctaLabel}>{ctaLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
