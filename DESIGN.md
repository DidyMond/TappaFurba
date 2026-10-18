---
name: TappaFurba Precision Navigation
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#059669'
  primary: '#059669'
  primary-strong: '#047857'
  on-primary: '#ffffff'
  primary-container: '#10B981'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#0284C7'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#0F172A'
  on-tertiary: '#ffffff'
  tertiary-container: '#334155'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-2xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  numeric-stat:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '800'
    lineHeight: 28px
    letterSpacing: -0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Rendering Rules (mandatory for all screen generations)

These rules take precedence over any inferred styling. Every generated screen MUST follow them to guarantee cross-screen coherence.

### Colors
- The brand primary color is ALWAYS `#059669` (Mint Emerald) for icons, lines, dots, route strokes, pins without text and light fills with dark text. **Exception (accessibility, WCAG AA):** every surface that carries **white text ≤14px** is filled with `primary-strong` (`#047857`, 5,5:1 against white; `#059669` gives only 3,77:1). Never use other darker greens (`#006948`…) for the brand.
- The brand secondary color is ALWAYS `#0284C7` (Cyan Ocean). Used for routes, GPS, telemetry.
- The tertiary color is ALWAYS `#0F172A` (Deep Slate). Used only for grounding typography and dark surfaces.
- Use `primary-strong` (#047857) for all primary CTA fills, active chip states, the «Migliore» badge, the green price pin on the map (and its tail) and the avatar: everything that has `text-on-primary` (white) on it. Use `primary` (#059669) for positive-metric values inside tinted pills (`text-primary` on `bg-primary/10`) only where the text is large or replaced by the dark variant below.
- Use `secondary` (#0284C7) for route lines, navigation icons, detour metrics.
- Per testo piccolo (≤14px) su sfondo chiaro, usare `text-on-primary-fixed-variant` (#005137) invece di `text-primary` (#059669) per conformità WCAG AA. I fill chiari/tinted restano `bg-primary/10`; i fill con testo bianco usano `bg-primary-strong`.
- Stessa regola per l'azzurro: testo piccolo (≤14px) in `secondary` su sfondo chiaro → `text-on-secondary-fixed-variant` (#004b73) invece di `text-secondary` (#0284C7). Le etichette secondarie di testo piccolo (es. indirizzo, modalità carburante) usano `text-on-surface-variant` invece di `text-outline` (4,49:1, sotto AA). **Regola testo bianco (WCAG AA):** il testo bianco ≤14px non sta mai su `bg-primary` (#059669, 3,77:1) ma su `bg-primary-strong` (#047857, 5,5:1): si scurisce il *riempimento*, non il testo. `bg-primary` resta per icone, linee, pallini, pin senza testo e interruttori. Il `theme_color` del manifest può restare `#059669` (non è contrasto di testo). Il test `apps/web/src/contrast.test.ts` scansiona il codice: ogni `text-on-primary` deve stare su un riempimento ≥ 4,5:1 e `bg-primary` è ammesso solo dove non c'è testo.

### Shapes & Radii
- **Cards in lists** (station results, settings sections, accordion groups, waypoint nodes): ALWAYS `rounded-lg` (2rem).
- **Tiles inside cards** (KPI bento tiles, fuel matrix rows, amenity grid items, inputs): `rounded-DEFAULT` (1rem).
- **Pills, CTAs, badges, chips, bottom navigation**: `rounded-full`.
- **Bottom sheets / modal containers**: `rounded-t-3xl` (top corners only).
- Never mix rounded-DEFAULT and rounded-lg on sibling cards at the same hierarchy level.

### Elevation
- List cards and inline surfaces: `shadow-sm` (level 1).
- Hero cards, savings cards, recommended station cards: `shadow-md` (level 2).
- Floating bottom sheets, modals, sticky CTA containers: `shadow-lg` + `backdrop-blur-md` or `backdrop-blur-xl` (level 3).
- Never apply hover:shadow-md to non-interactive cards (station price rows, KPI tiles, settings sections). Hover elevation is reserved for clickable cards only.

### Interactive States
- **Active chips and selectors** (fuel type, vehicle type, sort filter, toggles): `bg-primary-strong text-on-primary` (toggle knobs without text keep `bg-primary`). Never use `bg-inverse-surface` or dark fills for active states.
- **Inactive chips**: `bg-surface-container-low text-on-surface-variant` with no border.
- **Floating CTA (station detail «Apri nel Navigatore»)**: a full-width pill (`w-full h-12 rounded-full bg-primary-strong text-on-primary shadow-md`) in the content column (`max-w-md mx-auto px-margin`), with **no card** around it (no background, border, shadow or padding on a container); behind it the progressive blur (`.progressive-blur`: backdrop-blur layers masked by a gradient) so the scrolling content fades under the pill. The container ignores pointer events: only the pill is tappable.
- **Stepper buttons (+/−)**: `w-8 h-8 rounded-full bg-surface-container-low border border-outline-variant/40 text-primary hover:border-primary transition-colors`. Never use white bg with dark icon, and never apply shadow-sm.
- **Numeric values inside KPI tiles** (savings, fuel volume, thresholds): keep them in brand green as `text-primary` inside a `bg-primary/10` pill when they represent savings or positive metrics.
- **Labels above inputs and sections**: `font-label-sm font-semibold text-on-surface` with normal case. Do NOT apply `uppercase`, `tracking-wider`, or `text-outline` to section labels.

### Typography
- Section titles: `headline-sm` or `headline-md`, `text-on-surface`, no uppercase.
- Body values and prices: `numeric-stat` with `font-variant-numeric: tabular-nums` for all currency and distance numbers.
- All numbers (prices, km, minutes, liters) must use tabular figures so columns align during live GPS recalculation.

### Bottom Navigation (global, identical on all screens)
- Floating pill: `fixed inset-x-4 bottom-4 rounded-full bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30`.
- Tabs layout: `flex-col items-center gap-0.5 py-1 px-2` (icon on top, label below), label with `whitespace-nowrap` font-label-sm.
- Active tab: `text-on-primary-fixed-variant`; its `bg-primary-fixed/30` pill is a single absolutely-positioned indicator BEHIND the labels that slides between tabs (`transform`/width transition ~220ms ease-out, none under `prefers-reduced-motion`). Flat fill: no extra blur/glass on the indicator.
- Inactive tabs: `text-on-surface-variant hover:text-on-surface`.

### Header (global pattern, identical on all screens)
- Safe-area aware: `pt-safe` with 16px extra padding above content.
- Centered brand: the brand mark (see «Brand mark» below) at 36 px (32 px on stack screens) + wordmark "TappaFurba" in headline-md/headline-sm.
- Layout: three-column grid `grid-cols-[1fr_auto_1fr]` (left | brand | right). No avatar in the MVP (no auth/profile: it would be a dead control).
- On stack screens (detail pages): back button on the left, same centered brand, share action on the right.

### Brand mark («Pin-goccia»)
- The ONE mark of the app: a destination **pin** (white) with the **fuel drop** cut out in navy, on the brand gradient squircle (`rx = 22%`), with a dotted **route** under the pin. Source of truth: `assets/logo.svg` (200×200: gradient `#0284C7` → `#10B981` at 0%→100%, white `#FFFFFF`, navy `#0F172A`); `BrandLogo` repeats the same paths inline and a test compares them. Never redraw it by hand elsewhere.
- **Header:** 36 px (32 px on stack screens) next to the wordmark; full mark, with the route dots.
- **PWA «any» (192 and 512):** the mark as is (squircle, transparent corners). **Maskable (512):** full-bleed gradient with the mark inside the 80% safe zone (circle of radius 40% of the side; the mark is padded to 78%). **Apple touch icon (180):** full-bleed, the system rounds it.
- **Favicon (`favicon.svg`, `favicon.ico` 16 + 32 px):** the same mark WITHOUT the route dots (`<g id="route-dots">`; below ~3 px they are noise) and with the pin enlarged 1.3× around its centre, so it stays a readable shape at 16 px. Everything derived (PNG, ICO, OG image, `logo.svg` and `favicon.svg` in `public/`) is generated by `pnpm --filter @tappafurba/web generate:icons` from `assets/logo.svg` (sharp, M5 script) and committed.

### Map theme picker (Settings → «Tema Mappa»)
- Fifth Settings section, full row (`md:col-span-2`), closed by default like the others. Four cards: Light (default), Duotono, Carta Stradale, Monocromo; vertical list below `lg`, 2×2 grid from `lg`. Part of the draft saved by «Salva Preferenze» (the map applies it then); «Ripristina Predefiniti» goes back to Light at once.
- Card = `rounded-lg` on `surface-container-lowest`: preview image 400×240 (`aspect-[5/3]`, same place and zoom for all styles), name in `headline-sm`, one-line description in `body-sm` / `on-surface-variant`. **Always a 2px border**: `border-primary` when chosen (with a `primary-strong` check badge so the state is not colour-only), `border-outline-variant` otherwise, so choosing never moves anything. The hidden native radio takes the focus; the keyboard ring is `ring-2 ring-primary` on the card (`:focus-visible` only).

### Results sheet on mobile (below `md`; three snap points)
- **Anchored to the bottom of the screen**, running *behind* the floating bottom navigation: no dead strip between the sheet and the nav. The prices banner at the foot of the sheet keeps the nav's room (`--bottom-nav-clearance` = `--bottom-nav-offset` + the nav's measured height, see `index.css`/`BottomNav`), so the list gains the old gap.
- **Three snap points:** *minimized* = only a ~28 px handle zone above the bottom nav (the sheet hides behind the nav; the list and the prices banner are hidden, out of the Tab order); *collapsed* (the default, at every new search) = where the sheet always started (below the 40% map, 12 px overlap) down to the screen's bottom; *expanded* = ~85% of the viewport height — **never 100%**. The map keeps its 40% height in collapsed/expanded (the expanded sheet covers it in part) and **grows down to the sheet when this goes below collapsed**, so the map fills all the remaining space. The state is never persisted.
- **Handle** (`<button>`, `aria-expanded`, label «Espandi elenco stazioni» / «Comprimi elenco stazioni», `focus-visible` ring) inside an 18 px header strip with a wider touch area. **Drag only from the handle/header strip** (pointer events, pointer capture on press); the list keeps its own scroll. The sheet's height follows the finger, with rubber-banding at both edges (max 40 px, never reaching the header); on release it snaps to the nearest point in ~200 ms `ease-out`; with `prefers-reduced-motion` there is no transition. Release snaps to the nearest of the three points (a tie goes to collapsed). **A tap on the header never minimizes**: minimized → collapsed, collapsed → expanded, expanded → collapsed; minimizing is only by dragging down. A tap on the already-active «Risultati» tab of the bottom nav, while the sheet is minimized, restores collapsed. `aria-expanded` is `false` only when minimized; the label names what the next tap does («Espandi elenco stazioni» from minimized and collapsed, «Comprimi elenco stazioni» from expanded). Desktop (`md` and up) is unchanged: the 440 px side panel, no handle.

### Text fields (iOS focus zoom)
- iOS Safari zooms the page when a text field with a font size under 16 px gets the focus. Every `input`/`textarea`/`select` of text uses `field-text` (Tailwind component, existing tokens only): **`body-lg` (16 px) below `md` or with a coarse pointer (finger, iPad included), `body-md` (14 px) from `md` up with a mouse.** No other `text-*` size class on those fields. The viewport meta stays `width=device-width, initial-scale=1.0, viewport-fit=cover`: never `maximum-scale` or `user-scalable=no` (accessibility, and iOS ignores them). Sliders and radios do not zoom and don't need it. A test scans the sources so a new field can't miss the class.

### Scroll behavior
- Main content must always be scrollable vertically (no `overflow-hidden` on body or main).
- Horizontal pill rows must use `overflow-x-auto` with `shrink-0 whitespace-nowrap` children so they scroll on narrow viewports.
- Bottom sheets use internal `overflow-y-auto` and never cover the whole screen (the Results sheet tops out at 85% of the viewport), so the map and the header remain visible while scrolling results.

---

## Brand & Style

This design system is engineered for utility-first mobility intelligence. The brand personality balances hyper-pragmatic cost-efficiency with high-precision navigational assurance. Designed specifically for drivers planning mid-to-long distance journeys or daily commutes under economic pressure, it eliminates fuel price anxiety through clarity, immediacy, and trust.

The visual direction merges **Clean Modern Navigation** (inspired by contemporary automotive and mapping OS interfaces) with **Tactile Glass and Micro-Surfaces**. It prioritizes extreme legibility under changing ambient light, high-glanceability during quick interactions, and clear information density. Floating panels, crisp contrasting semantic badges, and ergonomic touch targets establish an efficient, calming cockpit atmosphere.

## Colors

The palette establishes an immediate semantic dialogue between economic savings and technological precision:

- **Primary (`#059669` / Mint Emerald)**: Identifies peak savings, optimal stations, positive price differentials, and primary commitment actions.
- **Secondary (`#0284C7` / Cyan Ocean)**: Anchors navigation trajectories, route lines, GPS indicators, and dynamic telemetry.
- **Tertiary (`#0F172A` / Deep Slate)**: Delivers grounding contrast on typography, dark-mode sheet headers, map overlays, and night-driving surfaces.
- **Neutral (`#64748B` / Slate Gray)**: Provides calibrated secondary labeling, borders, dividers, and inactive state styling.

### Semantic Tones & Accents
- **Best Price / Green Accent (`#10B981`)**: Highlights top-ranked fuel offers and zero-deviation stops.
- **Moderate / Amber Warning (`#F59E0B`)**: Flags mid-tier pricing or minor detours (>5 min extra).
- **Sub-optimal / Coral Alert (`#EF4444`)**: Flags costly options, closed pumps, or heavy traffic detours.
- **Surface Canvas (`#F8FAFC` to `#FFFFFF`)**: Ultra-clean daytime backgrounds with subtle cool slate undertones.

## Typography

The type system prioritizes instantaneous comprehension during movement.

- **Plus Jakarta Sans** brings geometric stability and modern warmth to titles, price displays, savings tallies, and modal headlines. Its open counters and geometric forms remain legible under direct sunlight.
- **Inter** handles all micro-copy, navigational instructions, telemetry badges, and dense station lists. Its neutral tabular figures ensure that prices (`€1.729`), detours (`+1.2 km`), and time deltas (`+3 min`) do not jump or shift during real-time GPS recalculations.
- Numbers relating to currency and distance must always render with tabular numbers (`font-variant-numeric: tabular-nums`).

## Layout & Spacing

The layout is built mobile-first, prioritizing thumb-reach ergonomics and continuous visual connection to the live map:

- **Mobile Viewport (up to 767px)**: Full-bleed base map canvas topped by an interactive sliding bottom sheet. Content spans the full viewport width minus outer safe margins (`1rem`). Critical actions rest inside the bottom 40% of the screen.
- **Tablet / Desktop Viewport (768px+)**: Fixed-width floating navigation sidebar (`400px` to `460px`) overlaying the active map viewport, utilizing balanced `1.5rem` to `2rem` outer framing.
- **Grid & Alignment**: Standard 4-column layout for mobile cards, shifting to an asymmetric multi-panel layout for wide screens. Spacing follows a consistent 4px/8px baseline rhythm to maintain dense yet scannable metrics.

## Elevation & Depth

Visual hierarchy uses layered ambient translucency and tinted elevations rather than heavy, opaque drop shadows:

- **Level 0 (Map Floor)**: The baseline canvas containing the map, vector route layers, and unselected waypoint nodes.
- **Level 1 (Card & Inline Surfaces)**: Solid `#FFFFFF` with an ultra-subtle border (`1px solid rgba(15, 23, 42, 0.08)`) and soft shadow (`0 2px 8px -2px rgba(15, 23, 42, 0.06)`).
- **Level 2 (Interactive Floating Sheets & Station Cards)**: Glassmorphic floating surfaces using `backdrop-filter: blur(16px)`, `rgba(255, 255, 255, 0.92)` fill, and an elevated shadow (`0 10px 25px -5px rgba(15, 23, 42, 0.10), 0 4px 6px -2px rgba(15, 23, 42, 0.04)`).
- **Level 3 (Modals, Overlays & Drag Handles)**: Strong ambient elevation (`0 20px 30px -10px rgba(15, 23, 42, 0.16)`) designed to keep wayfinder overlays distinctly detached from live map movement.

## Shapes

The interface embraces a **pill-shaped, tactile aesthetic** reminiscent of top-tier consumer mobility software:

- **Pills & Capsules**: Filter chips, station price tags, badge indicators, and dynamic action buttons use full pill rounding (`border-radius: 9999px`).
- **Sheets & Cards**: Bottom sheets and station recommendation tiles utilize generous `rounded-xl` (`1.5rem` to `2rem`) corners at the top edge, creating a friendly, hardware-integrated feel.
- **Pointers & Waypoints**: Map markers combine rounded pin heads with tapered anchor bases to pinpoint fuel locations on the route without obscuring road geometries.

## Components

### Buttons & Interactive Controls
- **Primary CTA**: Full pill shape, `#059669` emerald fill with white text, minimum height `48px` to guarantee confident touch accuracy while operating in vehicle docks. Hover/active states darken by 8%.
- **Route Action Buttons**: Floating rounded icons (`44x44px`) with frosted glass background (`rgba(255, 255, 255, 0.9)`), subtle border, and secondary color iconography.
- **Stepper buttons (+/−)**: Circular (`w-8 h-8 rounded-full`), `bg-surface-container-low`, border `outline-variant/40`, icon in `text-primary`, hover darkens border to `primary`. No shadow.

### Chips & Route Filter Selectors
- **Fuel Type Toggles (Benzina, Diesel, GPL, Metano, EV)**: Pill shaped, `36px` height. Inactive state: `bg-surface-container-low` with `text-on-surface-variant`. Active state: `bg-primary-strong` with `text-on-primary` and slight elevation.
- **Sort Filters ("Più conveniente", "Minor deviazione")**: Horizontal scrolling pills with leading micro-icons. Active: `bg-primary-strong text-on-primary`. Inactive: `bg-surface-container-lowest` with `border outline-variant/40`.

### Station Recommendation Cards
- Modular cards featuring:
  - **Left Section**: Station brand logo / icon + Station name and distance from current GPS position.
  - **Center Section**: Large numeric price (`€1.689/L`) formatted with `numeric-stat` styling.
  - **Right Section**: Delta badges detailing deviation (`+1.4 km` / `+2 min`) and total estimated route savings (`Risparmi €4.20`).
- Best choice highlighted with a 2px emerald top accent bar and a micro-pill `Migliore` inline with the station name (never a full-width banner that wraps on two lines).

### Badges & Micro-Telemetry
- High-contrast pill badges (`height: 22px`, font size `11px`, bold):
  - **Save Badge**: Emerald tint (`#ECFDF5`), `#065F46` label.
  - **Detour Badge**: Sky tint (`#F0F9FF`), `#0369A1` label.
  - **Delay Badge**: Amber tint (`#FFFBEB`), `#92400E` label.

### Input Fields (Waypoints & A-B Selector)
- Connected dual-input card: Origin (A) and Destination (B) connected by a subtle vertical dashed navigation path line.
- Inputs feature `44px` height, `#F1F5F9` background, `0.75rem` corner radius, clear placeholder text, and one-tap destination swap action.

## Screens

1. **Home / Ricerca Percorso** — Search entry point with glow search bar and frequent routes.
2. **Risultati & Mappa Distributori** — Map + bottom sheet with station cards, sort filters, quick toggles.
3. **Dettaglio Stazione Carburante** — Stack screen with station header, KPI bento, fuel matrix, amenities, floating CTA with progressive blur.
4. **Modifica Percorso** — Suspended pending architectural decision (likely to be absorbed into Risultati).
5. **Impostazioni Veicolo** — Accordion sections for vehicle profile, consumption, algorithm thresholds, notifications.