# M3 per-screen polish guide

The mechanical sweep already delivered: M3 color tokens (legacy names remapped),
Roboto body type, `m3-card` (12px outlined cards), pill buttons/chips, and the
new bottom-nav/rail. This pass makes each screen look *designed*, not converted.

**Scope: className strings and minimal JSX only. Never touch data fetching,
queries, state logic, or tests. Never run git commands.**

## Token vocabulary (Tailwind utilities, all live-theming)

- Surfaces (low → high emphasis): `bg-surface`, `bg-surface-container-low`,
  `bg-surface-container`, `bg-surface-container-high`, `bg-surface-container-highest`
- Text: `text-on-surface` (primary), `text-on-surface-variant` (secondary),
  `text-outline` (disabled/faint)
- Accents: `bg-primary text-on-primary`; containers `bg-primary-container
  text-on-primary-container`, same for `secondary-*`, `tertiary-*`
- Error: `bg-error-container text-on-error-container`, `text-error`
- Brand orange (logotype/hero numerals only): `text-brand`
- Legacy aliases still work (`ink`→surface, `bone`→on-surface, `accent`→primary,
  `signal-miss`→error) — prefer the M3 names in code you touch.

## The recipes

### 1. Kill seam-grids (highest-impact fix)
The old pattern `grid ... gap-px bg-ink-line` with `bg-ink` cells makes
hairline-seamed metric blocks — very terminal, very un-M3.

BEFORE: `<div class="grid grid-cols-3 gap-px bg-ink-line">` + cells `bg-ink p-6`
AFTER:  `<div class="grid grid-cols-3 gap-2">` + cells
        `bg-surface-container rounded-xl p-4 sm:p-5`

### 2. Card hierarchy
- Section cards: keep `m3-card` (outlined) for ordinary content.
- The screen's ONE hero card (main stat, tonight's mission, goal race):
  `rounded-2xl bg-surface-container-low p-5 sm:p-6` (filled, no border) —
  if it had an accent border (`border-accent/40`), use
  `rounded-2xl bg-primary-container/40 p-5` instead.
- Nested boxes inside cards: `bg-surface-container-high rounded-lg`.

### 3. Buttons (M3 roles)
- Primary action of the screen (save/submit/connect):
  `rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold
   hover:shadow-md active:opacity-90 transition-all` (drop border classes)
- Secondary actions: tonal — `rounded-full bg-secondary-container
  text-on-secondary-container px-5 py-2.5`
- Low-emphasis (cancel, edit, delete-text-links): text button —
  `rounded-full px-4 py-2 text-primary hover:bg-primary/8` (no border)
- Destructive: `text-error hover:bg-error/8`
- Keep `uppercase tracking-widest text-xs` styling if present — it's fine.

### 4. Inputs → filled fields
BEFORE: `bg-ink(-shadow) m3-card px-3 py-2 ...` or bordered inputs
AFTER:  `bg-surface-container-high rounded-lg border border-transparent
         px-3 py-2.5 focus:outline-none focus:border-primary transition-colors`
Labels above inputs: `text-[11px] font-medium text-on-surface-variant
tracking-wide` (drop uppercase if it looks shouty on forms; keep consistent
within a screen).

### 5. Progress bars / meters
Track: `h-2 rounded-full bg-surface-container-highest overflow-hidden`
Fill:  `h-full rounded-full bg-primary` (error state: `bg-error`;
ok: `bg-signal-ok`).

### 6. List rows
Rows in `divide-y divide-ink-line` lists: add `px-4 py-3` consistency and
hover `hover:bg-on-surface/4 transition-colors` where rows are interactive.

### 7. Chips/badges
Small status chips: `rounded-full px-2.5 py-0.5 text-[11px] font-medium` with
container colors (`bg-secondary-container text-on-secondary-container`,
`bg-error-container text-on-error-container` for problems).

### 8. Headers
Page headers keep the brand pattern: kicker `text-[11px] uppercase
tracking-widest text-on-surface-variant`, then `font-display text-4xl
tracking-widest uppercase text-on-surface`. Big hero numerals may use
`text-brand` sparingly (one per screen max).

### 9. What NOT to change
- `font-display` (Bebas) usage
- `no-scrollbar`, `overflow-x-auto` wrappers, `tabular-nums`
- Grid layouts/breakpoints (only their skins)
- Anything in `src/lib/**`
- Colors carrying meaning: signal-ok / signal-warn stay

## Definition of done per screen
- No `gap-px bg-ink-line` seam-grids remain
- One clear filled hero card; other cards outlined
- One clear filled primary button per form/screen; the rest tonal/text
- Inputs are filled fields
- `npx tsc -b` passes (run it from the repo root)

Reference implementation: `src/routes/patrol/PatrolPage.tsx`.
