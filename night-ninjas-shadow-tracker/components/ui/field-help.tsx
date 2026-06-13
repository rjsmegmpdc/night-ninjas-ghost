/**
 * FieldHelp — small italicised inline help shown under a form field.
 * Used on wizard fields where the label alone isn't enough to know what
 * to type. Brand-consistent: subtle, mono-spaced, dim text.
 */
export function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-bone-mute text-xs mt-2 font-mono leading-relaxed">
      ↳ {children}
    </p>
  );
}
