# BRAND.md

The VELOCITY brand. Identity, voice, naming conventions. Read alongside
DESIGN.md for visual specifics.

---

## Identity

**Name:** VELOCITY

**Subtitle (optional, internal use):** marathon training console

**Tagline candidates** (not yet locked):
- "Train deliberately."
- "Every session compounds."
- "The training console for serious runners."

The name reflects the product's central concern: not just running, but
training with measurable forward motion. Velocity = direction + speed.
Training plans give direction; pace zones quantify speed. The product
puts both on one screen.

---

## Naming history

| Era        | Name                            | Status      |
| ---------- | ------------------------------- | ----------- |
| 2024-2026  | Night Ninjas Shadow Tracker     | Retired UI-side; legacy code paths remain |
| 2026+      | VELOCITY                        | Active      |

**Why the rename:** the *Night Ninjas* identity emerged from a personal
brand context and read more like a stealth-ops product than a training
console. The visual restyle (rounded cards, layered surfaces, semantic
colour palette) needed a name with the same precision. VELOCITY honours
the cockpit-grade design vocabulary the redesign aims for.

**What did NOT change:**
- The codebase folder is still `night-ninjas-shadow-tracker` (no rename)
- The `package.json` name is still `night-ninjas-shadow-tracker`
- The GitHub repo is still `https://github.com/rjsmegmpdc/night-ninjas-shadow-tracker`
- The local data folder is still `%APPDATA%\NightNinjas\shadow-tracker.db`

These are deliberate non-changes - renaming files/repos/storage paths
is a follow-up task that may or may not be worth the refactor cost.
For now: **the user-visible product is VELOCITY; the underlying machinery
keeps its original names.**

---

## Wordmark

```
VELOCITY
```

- Display font: Bebas Neue
- Default colour: VELOCITY orange `#FF5F00`
- Always uppercase
- Letter-spacing: standard (0.04em via `tracking-wide-display`)
- Size: scale to context. Top nav: ~24-28px. Hero / login: 56px+.

The wordmark stands alone. No tagline beneath it in nav contexts.
Optional subtitle in onboarding hero contexts only.

---

## Voice

VELOCITY speaks the way a competent training partner would:

- **Direct.** "You missed last week's long run." Not "It looks like..."
- **Measured.** Numbers are presented without celebration or alarm.
  Hitting a PB is acknowledged, not confettied.
- **Honest about what it knows.** When data is sparse, the product says
  "estimated" rather than pretending precision. When confidence is low,
  the user is told.
- **Never paternal.** No "great job!" No "you can do it!" No motivational
  framing. The athlete is the agent. The product is the instrument.
- **Active not passive.** "Sync now" not "Sync when you can." "Choose this
  dojo" not "If you'd like, you could choose this dojo."

What VELOCITY doesn't do:

- Doesn't gamify ("achievement unlocked!")
- Doesn't moralise ("you should rest")
- Doesn't predict feelings ("you must be feeling tired")
- Doesn't refer to the user in third person ("the athlete")

---

## Locale defaults

VELOCITY targets the New Zealand serious-runner market. Locale defaults:

- Distance: km
- Pace: min:sec/km
- Elevation: m
- Date: DD/MM/YYYY
- Time: 24-hour
- First day of week: Monday
- Timezone: Pacific/Auckland (override available)

These are defaults. Settings allow override. But the design assumes the
NZ defaults unless the user specifies otherwise.

---

## Page-level naming

Pages keep their existing routes (no breaking URL changes for now).
The user-facing labels are:

| Route        | Display label   | Nav bucket  |
| ------------ | --------------- | ----------- |
| `/patrol`    | Dashboard       | Dashboard   |
| `/strike`    | Athlete State   | Analytics   |
| `/recon`     | Trends          | Analytics   |
| `/dojo`      | Methodology     | Training    |
| `/calendar`  | Schedule        | Training    |
| `/shoes`     | Equipment       | Profile     |
| `/journal`   | Wellness        | Profile     |
| `/settings`  | Settings        | Profile     |
| `/help`      | Reference       | Profile     |

The terms *Patrol / Strike / Recon / Dojo* are retained internally (in
code, comments, file names) but no longer shown in the UI. The new
top-nav uses the four bucket labels. Within each bucket, the page title
on the rendered screen reflects the *Display label* above.

---

## Open brand decisions (not yet locked)

1. **Streak indicator:** the flame icon next to the avatar in the top
   nav (visible in the design references) is presumed to be a streak
   indicator. Confirm whether this stays as a flame or changes.
2. **Tagline:** none of the candidates above are locked. Pick one or
   leave the wordmark unaccompanied.
3. **Favicon:** currently the Night Ninjas logo. Needs a VELOCITY
   replacement. Probably a stylised "V" or a velocity-vector glyph.
4. **App icon for Windows shortcut:** same as favicon question.
5. **Marketing surface:** there isn't one yet. When there is, this
   document expands to cover web copy, meta tags, OG image.
