import React from 'react';
import { cn } from './cn';

/** Shared token style for text inputs, selects, and textareas. */
export const fieldClass =
  'w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-app-text ' +
  'placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 ' +
  'focus:border-primary/50 transition-all';

export const labelClass =
  'text-[11px] font-medium tracking-[0.12em] text-app-muted mb-2 block uppercase';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn(labelClass, className)} {...props} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(fieldClass, className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClass, className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClass, 'appearance-none', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
