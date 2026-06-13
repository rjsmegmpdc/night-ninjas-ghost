# DESIGN.md

The VELOCITY design system. Single source of truth for brand tokens, type,
motion, surface treatment, and aesthetic intent. If a component doesn't
match this document, the component is wrong.

> **Note on history:** this product was originally branded *Night Ninjas
> Shadow Tracker*. As of bundle 8074e01+, the product is rebranded to
> **VELOCITY** with a refined visual system. Some legacy code paths
> (folder names, package.json) still use the old name; UI surfaces should
> all reflect VELOCITY going forward. See BRAND.md for the rebrand spec.

---

## Aesthetic intent

**Performance-cockpit precision.** The product is for runners who train
deliberately - dawn intervals, long Sunday efforts, 18-week marathon
blocks. The interface should feel like a high-end training console:
calm, dense with signal, never decorative for its own sake.

The visual language:

- **Soft-rounded surfaces** - cards use 12px radius. Inputs and buttons
  match. No sharp corners, no aggressive bevels.
- **Layered depth** - cards sit on a slightly elevated tone vs the page
  background. Active states get a subtle inner glow accent.
- **Single-purpose accent** - VELOCITY orange `#FF5F00` for active state,
  current focus, primary CTAs only. Never decorative.
- **Semantic colour pairs** - teal for stable/optimal/recovery, red for
  alert/elevated, amber for caution. Each colour has one job.
- **Mono-data, sans-prose, display-headers** - type roles are strict
  and consistent.
- **Motion is decisive** - 150-240ms ease-out. No springs. No bounce.

What VELOCITY is NOT:

- Not Strava-cheery (kudos, fire emojis, gradients on everything)
- Not Apple Fitness (rings, pastels, "celebrate the small wins")
- Not Whoop-clinical (deep navy and percentages without character)
- Not the previous Night Ninjas brutalist look (hard edges, all-mono)

---

## Colour tokens

All colours live as CSS custom properties on `:root` in `app/globals.css`.
Components reference them through Tailwind classes mapped to these tokens
in `tailwind.config.ts`. Never use raw hex in components.

### Ink (page + surface)

| Token            | Hex       | Usage                                     |
| ---------------- | --------- | ----------------------------------------- |
| `ink`            | `#0A0A0A` | True page background                      |
| `ink-shadow`     | `#141414` | Surface 1 - card backgrounds              |
| `ink-panel`      | `#1C1C1C` | Surface 2 - elevated panels, modals       |
| `ink-line`       | `#2A2A2A` | Borders, dividers (subtle)                |
| `ink-line-bold`  | `#3A3A3A` | Borders that need emphasis (active state) |

### Bone (foreground / type)

| Token        | Hex       | Usage                                  |
| ------------ | --------- | -------------------------------------- |
| `bone`       | `#F5F5F0` | Primary text, hero numbers             |
| `bone-dim`   | `#A5A5A0` | Secondary text, descriptive copy       |
| `bone-mute`  | `#6E6E6A` | Tertiary text, labels, muted captions  |

### Accent (VELOCITY orange - the canonical brand colour)

| Token           | Hex       | Usage                                                  |
| --------------- | --------- | ------------------------------------------------------ |
| `accent`        | `#FF5F00` | Active nav, primary CTAs, today indicator, current focus |
| `accent-hover`  | `#FF7A2B` | Hover state on accent surfaces                         |
| `accent-glow`   | `rgba(255, 95, 0, 0.18)` | Soft inner glow on active cards         |
| `accent-faint`  | `rgba(255, 95, 0, 0.08)` | Background tint on selected pills       |

### Signal (semantic state)

| Token          | Hex       | Usage                                              |
| -------------- | --------- | -------------------------------------------------- |
| `signal-ok`    | `#26D0AE` | Stable, optimal, recovery, polarised intensity     |
| `signal-warn`  | `#EAB308` | Caution, mixed intensity, borderline compliance    |
| `signal-miss`  | `#DC2626` | Alert, elevated RHR, missed compliance, overreach  |

### Matrix (training-context overrides)

| Token              | Hex       | Usage                                  |
| ------------------ | --------- | -------------------------------------- |
| `matrix-long`      | `#FF5F00` | Long runs in the program matrix        |
| `matrix-strength`  | `#7B6BFF` | Cross/strength sessions in the matrix  |

---

## Typography

Three-family system. Every text element belongs to exactly one family.

| Family          | Font            | Weight    | Use                                      |
| --------------- | --------------- | --------- | ---------------------------------------- |
| Display         | Bebas Neue      | 400       | H1/H2 page titles, hero numbers, ribbons |
| Body            | IBM Plex Sans   | 400 / 500 | Prose, descriptive copy, button text     |
| Mono            | JetBrains Mono  | 400 / 500 | Data, labels, paces, distances, times    |

Type rules:

- **Display is uppercase by default.** Letter-spacing 0.04em (`tracking-wide-display`)
- **Mono is tabular** - use `tabular-nums` on stat blocks
- **Caps eyebrows** above page titles use the `nn-caps` utility
- **Body sentence-case for prose**, never uppercase except for buttons

Sizing scale is Tailwind defaults. Hero numbers use `text-5xl` to `text-7xl`.

---

## Surface treatment

### Card

The fundamental container. Replaces the previous flat-and-borderless approach.

```
- Background: bg-ink-shadow
- Border: border-ink-line (1px)
- Radius: rounded-xl (12px)
- Padding: p-5 or p-6 depending on density
- Optional: ring-1 ring-accent/20 + inner glow when active or selected
- Optional: subtle drop shadow shadow-card on elevated surfaces
```

**Active card** has an accent border and slight inner glow:
```
border-accent ring-1 ring-accent/20 bg-ink-shadow
+ inset box-shadow with accent-glow colour
```

### Pill / chip

Smaller info containers, used for status indicators and metadata.

```
- Background: bg-ink-panel
- Border: optional border-ink-line
- Radius: rounded-md (also 8px)
- Padding: px-2.5 py-1
- Text: font-mono text-[10px] uppercase tracking-widest
```

### Button

| Variant     | Background       | Border          | Text        | Use                          |
| ----------- | ---------------- | --------------- | ----------- | ---------------------------- |
| Primary     | bg-accent        | none            | text-ink    | The primary CTA on a screen  |
| Secondary   | bg-ink-shadow    | border-ink-line | text-bone   | Most actions                 |
| Ghost       | transparent      | none            | text-bone-dim | Tertiary, footer, back nav |
| Destructive | bg-signal-miss/10| border-signal-miss | text-signal-miss | Delete, reset      |

All buttons are `rounded-lg` (also 12px). No 2px-radius rule any more.

### Input

```
- Background: bg-ink-shadow
- Border: border-ink-line, focus:border-accent
- Radius: rounded-lg
- Padding: px-3 py-2
- Font: font-mono for data, font-sans for prose inputs
```

---

## Layout

### Page-level structure

- Top nav is **horizontal**, full-width, sticky to top
- 4-item top nav: Dashboard / Training / Analytics / Profile
- Wordmark anchors the left of the top nav
- Avatar + streak flame indicator anchor the right
- Page content max-width `max-w-7xl` (1280px) for app pages
- Page padding `px-12 py-10` on desktop, narrows on mobile

### Vertical rhythm

- `space-y-8` between major sections within a page
- `space-y-4` between cards within a section
- `space-y-1.5` between rows in a list

### Sidebar (deprecated)

The previous left sidebar is retired. Components and references to it
should be removed during the rebrand restyle pass. Some files may still
import from `@/components/nav/sidebar` - these are stale.

---

## Motion

| Token          | Duration | Use                              |
| -------------- | -------- | -------------------------------- |
| `fade-in`      | 200ms    | Card mount, lazy-loaded content  |
| `slide-up`     | 240ms    | Modal, sheet, drawer entrance    |
| `pulse-subtle` | 1.6s     | Active recording indicator       |

Easing is `ease-out` for entrances, `ease-in` for exits. No springs.
No bounces. The product is precise, not playful.

---

## Iconography

- Library: lucide-react
- Stroke: 1.5px (always - never 1px or 2px)
- Size scale: 14, 16, 18, 20, 24
- Default size in nav: 18px
- Icons within text: 14px, vertically centred via flex

---

## What changed from the Night Ninjas era

The previous *Night Ninjas Shadow Tracker* design system used:

- Hard 2px-max edges with no rounding
- "Brutalist-industrial" stealth aesthetic
- Single canonical accent (`#FF5F00`) without semantic teal
- 9-item left sidebar nav
- No card shadows, no inner glow
- "Red is surgical" rule (now: red is alerts only, teal is stable, amber is caution)

These rules are explicitly retired as of the VELOCITY rebrand. Code paths
that still follow them are pending restyle and should be brought into line.

---

## Locked decisions (don't violate without conversation)

1. The accent is `#FF5F00`. No salmon, no lime, no teal-as-primary.
2. 4-item top nav. Not 3, not 5. Sub-navigation lives within sections.
3. Cards are rounded-xl. Inputs and buttons are rounded-lg.
4. Three font families. No display in body, no body in stats.
5. Distances in km, paces in min/km. Never miles. NZ default.
6. Date format: DD/MM/YYYY. NZ default.
7. First day of week: Monday default, Sunday opt-in via Settings.

If a designer or developer proposes violating any of the above, they
must update DESIGN.md first and have the change reviewed.
