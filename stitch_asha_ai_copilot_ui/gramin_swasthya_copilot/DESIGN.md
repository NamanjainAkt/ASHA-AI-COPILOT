---
name: Gramin Swasthya Copilot
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#3e4947'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#006b5f'
  on-secondary: '#ffffff'
  secondary-container: '#6df5e1'
  on-secondary-container: '#006f64'
  tertiary: '#893a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#af4c00'
  on-tertiary-container: '#ffe6da'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb690'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#783200'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
This design system powers a field-ready mobile intelligence tool for Accredited Social Health Activists (ASHA workers) across rural India. Operating in dynamic field environments—from direct sunlight in courtyards to low-connectivity village homes—the interface prioritizes utility, direct clarity, and ergonomic comfort over visual novelty.

### Design Movement: Tactile Functionalism
The visual philosophy blends utilitarian high-contrast layouts with soft, physical affordances:
- **Voice-First, Text-Second:** Primary tasks, clinical summaries, and navigation anchors can be triggered and confirmed via audio inputs, persistent mic docks, and read-aloud prompts.
- **Calm Urgency:** Clinical risk is communicated decisively without inducing panic. Alarm colors (reds and ambers) are reserved strictly for triaged medical escalation, never for mundane alerts or empty validation states.
- **Low-Literacy Friendly:** Every clinical term, vital status, and call-to-action pairs a legible bilingual text lockup (English / Hindi Devanagari) with unambiguous, universally recognized pictograms and a minimum 48dp hit area.
- **Invisible Offline State:** Field resilience is absolute. Lack of network connection operates silently without blocking workflows; an understated persistent status bar informs data sync status transparently.

## Colors
The palette balances institutional clinical trust with outdoor legibility and calm triage prioritization.

### Palette Architecture
- **Primary / Grounding Teal (`#0F766E`):** Represents institutional authority, structural framing, high-contrast headings, and app bar headers.
- **Primary Action / Bright Teal (`#14B8A6`):** The default action token. Used for interactive states, primary action buttons, active voice-listening animations, and focal points.
- **Surface Tint / Light Teal (`#CCFBF1`):** Subdued surface container fill for active list items, completed patient visit badges, and selected filter chips.
- **Accent / Follow-Up Amber-Orange (`#F97316`):** Signals scheduled follow-ups, pending immunization visits, and moderate tracking obligations without triggering distress.
- **Clinical Danger (`#DC2626`):** Strictly reserved for severe maternal or neonatal risk indicators, maternal high blood pressure emergencies, immediate referral triggers, and destructive confirmations.
- **Clinical Warning (`#F59E0B`):** Border highlights and indicator badges for moderate clinical anomalies (e.g., slight fetal growth drop, mild anemia flags).
- **Clinical Success / Sync (`#16A34A`):** Confirmation of successfully queued or synced records, vaccine administered states, and verified home visits.
- **Neutrals & Foundation:**
  - `neutral/900` (`#111827`): Dominant text color achieving WCAG AAA contrast ratio on mobile glass screens under sunlight.
  - `neutral/600` (`#4B5563`): Supporting metadata, bilingual translation secondary strings, and auxiliary metrics.
  - `neutral/200` (`#E5E7EB`): Structural hairline borders, card frames, and field demarcations.
  - `neutral/50` (`#F9FAFB`): Canvas base background minimizing glare and battery consumption.
  - `offline/gray` (`#9CA3AF`): Passive, non-blocking sync status icons and disabled action frames.

## Typography
Type hierarchy supports rapid scanning by community health workers who often switch between English record standards and Hindi vernacular prompts.

### Dual-Script Typography Strategy
- **Base Family:** `Inter` handles English numerals, dates, and administrative labels with tall x-height and clear character differentiation (e.g., `0` vs `O`, `1` vs `I`).
- **Devanagari Companion:** System fallbacks point automatically to `Noto Sans Devanagari`. Line heights are intentionally spaced 4px taller than conventional Latin scales to prevent matra and conjunct clipping.
- **Hierarchical Bilingual Pairing:** Primary patient names or clinical instructions appear in standard weight English or Hindi, with the immediate bilingual translation placed directly underneath in `body-sm` (`#4B5563`).
- **Numerical Dominance:** Vital stats, gestations (weeks/days), and hemoglobin counts leverage `headline-md` or `headline-lg-mobile` in semi-bold tabular numerals (`font-variant-numeric: tabular-nums`) to prevent jitter across dynamic updates.

## Layout & Spacing
Designed from the physical palm outwards, the layout rules conform to single-handed thumb zones and budget Android form factors (typically 360dp to 412dp screen widths).

### Form Factor Behavior
- **Touch Target Mandate:** Every clickable icon, selection card, and action element must honor a strict minimum touch boundary of **48 × 48dp** (preferred 56dp for quick field inputs).
- **Mobile First Canvas (0–599dp):** Single-column fluid view. Structural margin is fixed to `1rem` (16px) to maximize horizontal data space for tables, child-growth cards, and vital signs forms.
- **Tablet / Primary Health Center Dashboard (600dp+):** 8-column split screen where patient triage directories persist on the left 3 columns, and clinical encounter workflows occupy the remaining 5 columns.
- **Bottom Sheet Affinity:** Critical multi-step flows (e.g., adding an immunization record or recording infant birth weight) load as bottom sheets anchored in the thumb zone rather than full-page redirects.

## Elevation & Depth
In high-glare rural outdoor conditions, subtle shadows disappear completely. Depth is achieved via **tonal structural layering and low-contrast perimeter borders** rather than diffuse drop shadows.

### Elevation Hierarchy
- **Level 0 (Canvas):** `#F9FAFB` flat base.
- **Level 1 (Clinical Cards & Patient Rows):** Pure white background (`#FFFFFF`) framed by a 1px solid border of `#E5E7EB`. Used for beneficiary profile cards, household lists, and visit summaries.
- **Level 2 (Active/Floating Controls):** Raised elements like the primary Voice Dictation Pill or bottom sticky actions use a defined ambient rim: `0 4px 12px rgba(15, 118, 110, 0.12)` paired with a 1px border of `#CCFBF1`.
- **Level 3 (Modal Alerts & Bottom Drawers):** Backdrop overlay tinted with `#111827` at 40% opacity, supporting a white elevated card framed with `0 8px 24px rgba(0, 0, 0, 0.08)`.

## Shapes
A roundedness value of `2` provides balanced, sturdy geometry:
- Base inputs, field cards, and buttons use an 8px (`0.5rem`) corner radius, ensuring distinct perimeter visibility without feeling childish or informal.
- High-priority patient risk indicator tags use `rounded-lg` (`1rem`) to present a protective, pill-like visual cue.
- Voice invocation floating buttons use full circular geometry (`9999px`) to emphasize distinct tactile presence above all other functional grids.

## Components

### 1. Primary Voice Action Dock
- **Construction:** Fixed bottom floating container spanning the screen width minus horizontal margins. Features a central 64dp circular microphone button flanked by quick audio play/repeat and language toggles.
- **States:**
  - *Idle:* Teal `#0F766E` icon over `#14B8A6` background with a subtle pulsing radar wave.
  - *Listening:* `#DC2626` center beacon with an animated audio waveform in white.
  - *Processing:* Light teal `#CCFBF1` surface with `#0F766E` rotating perimeter indicator.

### 2. Buttons & Touch Targets
- **Primary Button:** `#14B8A6` solid background with white text (`#FFFFFF`), 52dp height, centered 20dp icon paired with dual-line English/Hindi label.
- **Secondary Action:** White surface, 1.5px border of `#0F766E`, text in `#0F766E`.
- **Urgent Referral Action:** Solid `#DC2626` fill, white text, prefixed with an emergency transit siren or hospital icon.

### 3. Patient Beneficiary Cards
- Structured lists of mothers, infants, and households.
- **Left Edge Border Cue:** 4px vertical accent bar:
  - Red (`#DC2626`) for High-Risk Pregnancy (HRP).
  - Amber (`#F97316`) for overdue vaccination/ANC checkup.
  - Green (`#16A34A`) for complete/healthy schedule.
- **Content:** Large beneficiary name in `label-lg`, maternal age, trimester or child age in months, and a dedicated 48dp telephone/voice note action on the card right flank.

### 4. Input Fields & Steppers
- Text inputs provide minimum 52dp height with a persistent `#E5E7EB` outline, transitioning to a 2px `#0F766E` ring upon focus.
- Numerical fields (blood pressure, temperature, weight in kg) use split decrement/increment stepper modules with oversized `+` and `−` touch buttons (56dp wide each) to eliminate typing errors with damp or gloved hands.

### 5. Chips & Triage Filters
- Height 40dp with minimum 12px internal padding.
- Unselected: White fill, `#E5E7EB` outline, `#4B5563` text.
- Selected: `#CCFBF1` background, `#0F766E` outline, `#0F766E` bold label with a leading checkmark icon.

### 6. Invisible Sync & Connectivity Banner
- Subdued 28dp top status bar sitting directly below system chrome.
- Displays `#16A34A` dot with text "All 18 records safe on phone" when offline, switching to a miniature rotating sync indicator only when active cellular connection is detected and background sync is processing.