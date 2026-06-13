import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full bg-ink-panel border border-ink-line px-3 py-2 text-sm text-bone',
      'font-mono placeholder:text-bone-mute',
      'focus-visible:outline-none focus-visible:border-accent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'transition-colors duration-150',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'nn-caps mb-2 block',
      className
    )}
    {...props}
  />
));
Label.displayName = 'Label';
