import { cn } from '@/lib/utils';

/**
 * Night Ninjas mask glyph.
 *
 * A simplified, geometric reinterpretation of the existing brand mark —
 * the mask shape with crossed bones above. Designed at 32px and scales
 * cleanly. No fills or outlines; uses currentColor so it inherits text
 * colour from the parent (pair with `text-bone` or `text-accent`).
 */
export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      role="img"
      aria-label="Night Ninjas"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-bone', className)}
    >
      {/* Crossed bones — abstracted to two angled rectangles with knobs */}
      <g fill="currentColor">
        {/* Bone 1 - top-left to bottom-right */}
        <g transform="translate(32 16) rotate(-45)">
          <rect x="-22" y="-2" width="44" height="4" />
          <circle cx="-22" cy="0" r="3" />
          <circle cx="22" cy="0" r="3" />
        </g>
        {/* Bone 2 - top-right to bottom-left */}
        <g transform="translate(32 16) rotate(45)">
          <rect x="-22" y="-2" width="44" height="4" />
          <circle cx="-22" cy="0" r="3" />
          <circle cx="22" cy="0" r="3" />
        </g>
      </g>

      {/* Mask — squared, with two angled eye slits */}
      <g fill="currentColor">
        <path d="M 8 30 L 56 30 L 56 56 L 32 60 L 8 56 Z" />
      </g>
      {/* Eye slits — cut out using ink colour */}
      <g fill="var(--nn-ink)">
        <polygon points="14,40 26,40 24,46 14,46" />
        <polygon points="38,40 50,40 50,46 40,46" />
      </g>
    </svg>
  );
}
