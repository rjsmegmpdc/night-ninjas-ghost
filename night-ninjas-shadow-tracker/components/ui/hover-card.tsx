/**
 * HoverCard — small tooltip-style card revealed on hover/focus of its
 * trigger. Pure CSS visibility via group-hover; no JavaScript, no portals.
 *
 * Usage:
 *   <HoverCardTrigger>
 *     <SomeChip />
 *     <HoverCard>
 *       Tooltip content here
 *     </HoverCard>
 *   </HoverCardTrigger>
 *
 * The trigger uses Tailwind's `group` so children with `group-hover:`
 * classes can react. Card defaults to top-positioned; pass `placement`
 * to override. Card has its own pointer-events-none so the cursor
 * doesn't get stuck on it.
 *
 * Reads as "richer than a browser title attribute, lighter than a popover".
 * Suitable for chips, badges, info icons. Not suitable for interactive
 * content (use a popover for that).
 */

import { type ReactNode } from 'react';

export function HoverCardTrigger({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // tabIndex makes the trigger keyboard-focusable so the focus-within
  // CSS reveal also works for keyboard users
  return (
    <span
      tabIndex={0}
      className={'group relative inline-block focus:outline-none ' + className}
    >
      {children}
    </span>
  );
}

export function HoverCard({
  children,
  placement = 'bottom',
  width = 'w-64',
}: {
  children: ReactNode;
  placement?: 'top' | 'bottom';
  width?: string;
}) {
  const placementClasses =
    placement === 'top'
      ? 'bottom-full mb-2'
      : 'top-full mt-2';

  return (
    <span
      role="tooltip"
      className={
        'pointer-events-none absolute right-0 z-50 ' +
        placementClasses +
        ' ' +
        width +
        ' opacity-0 translate-y-1 transition-all duration-150 ' +
        'group-hover:opacity-100 group-hover:translate-y-0 ' +
        'group-focus-within:opacity-100 group-focus-within:translate-y-0 ' +
        'border border-ink-line bg-ink-panel text-bone shadow-lg ' +
        'px-3 py-2 font-mono text-[11px] leading-relaxed text-left'
      }
    >
      {children}
    </span>
  );
}
