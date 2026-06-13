import { cn } from '@/lib/utils';

/**
 * VELOCITY wordmark.
 *
 * The wordmark stands alone. No tagline by default; an optional 'tagline'
 * variant is available for hero / onboarding contexts only.
 *
 * The accent variant renders in VELOCITY orange. The bone variant renders
 * in primary text colour for low-emphasis contexts.
 */
export function Wordmark({
  className,
  variant = 'accent',
  size = 'md',
}: {
  className?: string;
  variant?: 'accent' | 'bone';
  /** Size: nav (24px), md (32px), lg (56px), xl (84px) */
  size?: 'nav' | 'md' | 'lg' | 'xl';
}) {
  const sizeClass = {
    nav: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-5xl',
    xl: 'text-7xl',
  }[size];

  const colourClass = variant === 'accent' ? 'text-accent' : 'text-bone';

  return (
    <span
      className={cn(
        'font-display tracking-wide-display leading-none uppercase',
        sizeClass,
        colourClass,
        className
      )}
    >
      VELOCITY
    </span>
  );
}
