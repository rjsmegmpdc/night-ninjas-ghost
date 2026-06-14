'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base - VELOCITY rounded-lg, body sans for legibility, transitions kept fast
  'inline-flex items-center justify-center font-display uppercase tracking-wide-display text-sm rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
  {
    variants: {
      variant: {
        // Primary - accent fill, ink text. The "do this" CTA.
        primary:
          'bg-accent text-ink hover:bg-accent-hover border border-accent',
        // Critical - destructive. Now uses signal-miss; accent reserved for primary CTAs.
        critical:
          'bg-signal-miss/10 text-signal-miss hover:bg-signal-miss/20 border border-signal-miss/40',
        // Outline - default secondary action. Sits on ink-shadow surfaces.
        outline:
          'bg-ink-shadow text-bone border border-ink-line hover:border-ink-line-bold hover:text-bone',
        // Ghost - tertiary. No border. For back/dismiss actions.
        ghost:
          'bg-transparent text-bone-dim hover:text-bone hover:bg-ink-shadow border border-transparent',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = 'Button';
