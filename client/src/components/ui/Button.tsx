import React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99]',
  secondary: 'bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong',
  danger: 'bg-danger text-white hover:brightness-110 active:scale-[0.99]',
  ghost: 'text-app-muted hover:text-app-text',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-3.5 py-2 rounded-lg',
  md: 'text-sm px-4 py-2.5 rounded-xl',
  lg: 'text-base px-5 py-3 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/** Primary action button in the Orbit design system. Replaces the repeated
 *  `bg-primary text-on-primary shadow-glow …` / secondary / danger class stacks. */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', fullWidth, className, type = 'button', ...props
}) => (
  <button
    type={type}
    className={cn(
      'inline-flex items-center justify-center gap-2 font-semibold transition-all',
      'disabled:opacity-50 disabled:pointer-events-none',
      VARIANTS[variant],
      SIZES[size],
      fullWidth && 'w-full',
      className,
    )}
    {...props}
  />
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'danger' tints the icon red on hover; 'default' is the neutral surface button. */
  tone?: 'default' | 'danger';
}

/** Square icon-only button (nav actions, close, edit/delete rows). */
export const IconButton: React.FC<IconButtonProps> = ({
  tone = 'default', className, type = 'button', ...props
}) => (
  <button
    type={type}
    className={cn(
      'grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border transition-colors',
      tone === 'danger'
        ? 'text-danger hover:bg-danger/10 hover:border-danger/40'
        : 'text-app-muted hover:text-app-text hover:border-app-border-strong',
      className,
    )}
    {...props}
  />
);
