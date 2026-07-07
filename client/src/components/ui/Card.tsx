import React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Padding utilities; pass '' for a flush card you pad internally. */
  padding?: string;
  /** Add the frosted backdrop blur (reserve for stable/overlay surfaces). */
  blur?: boolean;
}

/** Translucent glass panel — the standard Orbit surface. Replaces the
 *  `glass rounded-2xl p-…` stack repeated across every screen. */
export const Card: React.FC<CardProps> = ({
  padding = 'p-5 md:p-7', blur = false, className, ...props
}) => (
  <div className={cn('glass rounded-2xl', blur && 'glass-blur', padding, className)} {...props} />
);
