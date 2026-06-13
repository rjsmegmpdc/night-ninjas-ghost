import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    /** Use ink-panel background for elevated surfaces (modals, hero cards) */
    elevated?: boolean;
    /** Render the accent border + inner-glow active state */
    active?: boolean;
  }
>(({ className, elevated = false, active = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      active ? 'nn-card-active' : elevated ? 'nn-card-elevated' : 'nn-card',
      'p-6',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-2 mb-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('nn-display text-xl text-bone', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('nn-caps', className)} {...props} />
));
CardLabel.displayName = 'CardLabel';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-bone', className)} {...props} />
));
CardContent.displayName = 'CardContent';
