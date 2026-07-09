---
name: HOBBIT
description: Group accountability tracker for discipline and habit challenges — here to annoy you into great habits.
colors:
  primary-red: '#e63329'
  primary-red-hover: '#c42a22'
  primary-red-light-bg: 'oklch(50% 0.22 25 / 0.10)'
  accent-orange: '#f97316'
  gold: '#f5c842'
  silver: '#a8b2b8'
  bronze: '#cd7f32'
  base-bg: '#0a0a0a'
  surface: '#111111'
  surface-raised: '#1a1a1a'
  border-dark: '#2a2a2a'
  border-light: '#e7e5e4'
  text-primary-dark: '#f0f0f0'
  text-muted-dark: '#6b7280'
  text-primary-light: '#1c1917'
  text-muted-light: '#57534e'
  success: '#22c55e'
  success-light: '#166534'
  overlay: 'rgb(0 0 0 / 0.7)'
typography:
  display:
    fontFamily: 'Bebas Neue, sans-serif'
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 'normal'
  body:
    fontFamily: 'Inter, sans-serif'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'JetBrains Mono, monospace'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.15em'
    textTransform: 'uppercase'
rounded:
  sm: '4px'
  md: '8px'
  lg: '12px'
  full: '9999px'
spacing:
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary-red}'
    textColor: '#ffffff'
    rounded: '{rounded.full}'
    padding: '12px 24px'
  button-primary-hover:
    backgroundColor: '#c42a22'
  button-destructive:
    backgroundColor: '#e63329'
    textColor: '#ffffff'
    rounded: '{rounded.full}'
  button-outline:
    backgroundColor: 'rgba(255,255,255,0.8)'
    textColor: '#1c1917'
    rounded: '{rounded.full}'
  stat-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text-primary-dark}'
    rounded: '{rounded.lg}'
    padding: '16px'
  task-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text-primary-dark}'
    rounded: '{rounded.lg}'
  streak-badge:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.gold}'
    rounded: '{rounded.full}'
    padding: '4px 12px'
  nav-link-active:
    backgroundColor: '{colors.primary-red-light-bg}'
    textColor: '{colors.primary-red}'
    rounded: '{rounded.lg}'
  proof-uploader:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.text-muted-dark}'
    rounded: '{rounded.lg}'
    padding: '12px 16px'
---

# Design System: HOBBIT

## 1. Overview

**Creative North Star: "The Accountability Gym"**

HOBBIT's interface is a gym for discipline — not a spa. It's dark, high-contrast, and urgent. Primary red cuts through the near-black background like a coach shouting your name. Gold marks achievement with earned weight. Silver and bronze reward effort but communicate "not done yet." Every surface, every border, every label exists to serve one job: get the user in, prove they did the work, see where they stand, and get out.

The system deliberately rejects enterprise dashboard sprawl. There are no nested data tables, no 50-widget views, no "export to CSV" energy. Pages are single-purpose and fast. Navigation is a fixed sidebar on desktop and a bottom tab bar on mobile — both using compact mono labels and emoji icons. The layout collapses to a single scrollable column with no side-panels. Density is reserved for the leaderboard table and history view; everywhere else, spacing breathes.

Dark mode is the default and the true identity. A light theme exists as a secondary mode, mapped token-for-token, but the dark palette is where the aggression and energy live. Light mode renders the same layout with softer contrast — it's functional, not the showpiece.

**Key Characteristics:**

- Near-black background with high-contrast text and a single red accent
- Bebas Neue display for big numbers and hierarchy, Inter for body, JetBrains Mono for all labels, badges, and data
- Full-pill buttons and badges; 8–12px card corners
- No decorative shadows on cards; shadows exist only on primary buttons as a lift signal
- Flat-by-default surfaces, tonal layering for depth (base → surface → raised)
- Motion is fast (150–200 ms) and state-driven; no orchestrated page-load sequences
- Reduced motion respected everywhere with instant-transition fallbacks
- Skeleton shimmer loading states, never blank spinners

## 2. Colors

Near-black dominance with a single red through-line. Gold is the reward signal. Silver and bronze are the podium tier signals. Everything else is neutral.

### Primary

- **Habit Red** (`#e63329` / `oklch(55% 0.24 28)`): The only accent color. Used for primary buttons, active nav states, the DayCounter display digit, status badges (overdue / rejected), and the confetti checkmark. On hover deepens to `#c42a22`. Appears at roughly 5–10% of any screen; rarity is intentional.
- **Habit Red 10% bg** (`oklch(50% 0.22 25 / 0.10)`): Background tint for active nav links and row highlights. Semi-transparent so it reads against both dark and light surfaces.

### Secondary

- **Ember Orange** (`#f97316`): The gradient end-point on the DayCounter progress bar (red → orange). Used nowhere else. Purely a progress signal.

### Tertiary (Podium)

- **Gold** (`#f5c842`): Fill for earned milestone markers, 1st place podium, current-day journey cursor, streak badges. The reward signal. In light mode, the text role shifts to `#92400e` (dark gold) for contrast.
- **Silver** (`#a8b2b8`): 2nd place podium only. No other role.
- **Bronze** (`#cd7f32`): 3rd place podium only. No other role.

### Neutral

- **Base Background** (`#0a0a0a`): The page-level background. Near-black, not pure black. Light mode: `#f7f5f2`.
- **Surface** (`#111111`): Card and sidebar background. One step above base. Light mode: `#ffffff`.
- **Surface Raised** (`#1a1a1a`): Elevated within cards — stat cards, badge backgrounds, expanded sections, skeleton base. Light mode: `#f0eeeb`.
- **Text Primary** (`#f0f0f0`): Body text, headings, data. Near-white on dark backgrounds. Light mode: `#1c1917`.
- **Text Muted** (`#6b7280`): Secondary text, labels, metadata. Light mode: `#57534e`.
- **Border** (`#2a2a2a`): All borders, dividers, table rules. Light mode: `#e7e5e4`.
- **Success Green** (`#22c55e`): Completed state background, status badge text, celebration copy, heatmap "completed" cells. Light mode: `#166534`.
- **Overlay** (`rgb(0 0 0 / 0.7)`): Modal backdrops and scrims.

### Named Rules

- **The One Red Rule.** Habit Red is the only accent color used for interactive elements. Ember Orange, Gold, Silver, and Bronze are reserved for progress and reward signals — never for clickable UI. If a new interactive element needs color, it uses Habit Red or stays neutral.
- **The Surface Ladder Rule.** Three surfaces only: base → surface → raised. No fourth layer, no nested cards. If depth requires more layering, the layout is too nested.
- **The Gold Is Earned Rule.** Gold appears only on earned milestones, active streaks, and first-place podium positions. Never as decoration. Never on pending or empty states.

## 3. Typography

**Display Font:** Bebas Neue (with sans-serif fallback)
**Body Font:** Inter (with sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** Bebas Neue carries the aggression — tall, condensed, industrial. Inter keeps body text crisp and readable at small sizes. JetBrains Mono brings the data-lab feel to labels, badges, and metrics. The pairing is gritty and functional, never precious.

### Hierarchy

- **Display** (400, `clamp(2.5rem, 8vw, 6rem)`, 1.0): DayCounter numbers, podium ranks. Bebas Neue only. No letter-spacing override.
- **Headline** (600, `1.25rem / 20px`, 1.3): Section titles, page headings. Inter semibold.
- **Body** (400, `0.875rem / 14px`, 1.5): All reading text, task titles, descriptions. Inter regular. Max line length 65–75ch for prose; denser for data (tables at 120ch+).
- **Label** (600, `10px`, 1.4, `letter-spacing: 0.15em`, uppercase): Navigation items, stat labels, status badges, section kickers, form labels. JetBrains Mono semibold, always uppercase. This is the unified label vocabulary — no mixed families in UI chrome.

### Named Rules

- **The One Label Rule.** All UI labels — nav items, stat headers, status badges, form labels, table headers — use JetBrains Mono uppercase at 10px with 0.15em tracking. No exceptions. No Inter labels in chrome.
- **The Display Ceiling Rule.** Display text (DayCounter, podium ranks) uses Bebas Neue at sizes between 2rem and 6rem. Never on buttons, labels, body text, or data tables.
- **The Font Count Rule.** Three families total: Bebas Neue, Inter, JetBrains Mono. Never introduce a fourth. If a design calls for another voice, use weight or size variation within these three.

## 4. Elevation

This system is flat by default. Depth is conveyed through tonal layering (base → surface → raised), not shadows. Cards sit on the surface with 1px borders; they don't float. The only shadow in the entire system is on primary buttons — a deliberate lift signal that says "this is the action."

### Shadow Vocabulary

- **Button Lift** (`box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18)`): Primary and destructive buttons only. The one shadow in the system. Communicates elevation and clickability. Removed on disabled state.
- **Task Complete Ring** (`box-shadow: 0 0 0 Npx color-mix(in srgb, var(--success) M%, transparent)`): Animated status ring on task completion. Transient; not a persistent shadow.
- **Journey Today Pulse** (`box-shadow: 0 0 0 Npx color-mix(in srgb, var(--gold) M%, transparent)`): Pulsing ring on the current-day journey tile. Persistent animation.

### Named Rules

- **The Flat-By-Default Rule.** Surfaces are flat at rest. Borders define edges; tonal layers define depth. The only persistent shadow in the entire system is the button lift.
- **The No Ghost Card Rule.** Never pair `border: 1px solid` with `box-shadow` blur ≥ 8px on the same element. Cards use borders. Buttons use shadows. Never both as decoration.

## 5. Components

### Buttons

- **Shape:** Full pill (border-radius 9999px). Always.
- **Primary:** `background: var(--accent-red)`, `color: white`, `padding: 12px 24px` (h-11), font-semibold. Shadow: `0 16px 40px rgba(15,23,42,0.18)`. Hover: `translateY(-0.5px)`, background deepens to `--accent-red-hover`. Focus-visible: 2px ring in slate-950/20. Disabled: 50% opacity.
- **Destructive:** Same as primary but with rose-600 bg and matching shadow. Hover: rose-500.
- **Outline:** `border: 1px solid var(--border)`, `background: white/80` with `backdrop-blur`. Hover: `translateY(-0.5px)`, border darkens. Used in light theme contexts.
- **Ghost:** No border, transparent bg. Hover: slight bg tint. Used for icon-only buttons, secondary actions.
- **Sizes:** `sm` (h-9, px-4, text-xs), `md` (h-11, px-5, default), `lg` (h-14, px-7, text-base), `icon` (h-11, w-11).
- **Transition:** 200ms on bg and transform. Hover lift is -0.5px translateY.

### Task Card (Signature Component)

The central interaction surface. Every task in the challenge is one of these.

- **Shape:** Rounded-lg (8px), 1px border in `--border`, background `--surface`.
- **Layout:** Horizontal strip: emoji icon → title + metadata → status badge. Right edge: optional guidance (ⓘ) and expand (+) buttons, each 48px wide with left border.
- **Status badges:** Pill (rounded-md), 10px JetBrains Mono uppercase, 1px border. Four states: Pending (muted text, raised surface), Completed (success green bg at 10% + text), Overdue (accent-red bg at 10% + text), Rejected (accent-red bg at 10% + text).
- **Expandable:** Number inputs, tier chips, and sub-point toggles appear below a top-border separator. Sub-point toggles are Done/Failed button pairs in surface-raised cards.
- **Guidance panel:** Rules section (mono-labeled), tips with bullets, optional "Ask AI" chat widget with compact input + send button.
- **Animation:** On completion, a 480ms cubic-bezier(0.22, 1, 0.36, 1) animation plays: subtle card scale (1 → 1.008 → 1) and status ring pulse. Skipped entirely when `prefers-reduced-motion: reduce`.
- **Streak display:** When present, a gold mono label with fire emoji sits below the title.

### Navigation

- **Desktop sidebar:** Fixed left, 224px (w-56), `background: var(--surface)`, border-right in `--border`. Brand name in Bebas Neue at 2xl in accent-red, subtitle in 10px mono uppercase at 0.3em tracking. Nav links: rounded-lg, 12px padding, 14px Inter text with emoji icon. Active: accent-red/10 bg + accent-red text. Inactive: muted text, hover to surface-raised bg + primary text. Admin section pinned to bottom with top-border separator.
- **Mobile bottom nav:** Fixed bottom, full-width, `background: var(--surface)`, border-top. Flex row of icon+label items at 10px mono uppercase. Active: accent-red text. Inactive: muted text. Admin items appear in a separate row above with border separator.

### Stat Cards (StatsRow)

- **Shape:** Rounded-lg (8px), 1px border in `--border`, `background: var(--surface)`, centered text, 16px padding.
- **Layout:** Responsive grid: 2 cols mobile, 3 cols tablet, 5 cols desktop. Gap: 12px.
- **Content:** Mono uppercase label at 10px with 0.2em tracking (muted), large display value at 24px (text-primary). Display numbers use Bebas Neue exclusively.
- **No hover effect.** Stats are read-only; no interactive state needed.

### Leaderboard Table

- **Shape:** Rounded-lg container border, no internal cell borders except row separators. `background: var(--surface)`.
- **Mobile (cards):** Stacked list items with border-bottom separators. Each row: rank (Bebas Neue bold) + avatar + name + success rate. Secondary line: Day · Streak · XP in mono text-xs muted.
- **Desktop (table):** Full table with header row in surface background. Columns: Rank, Member, Day, Streak, XP, Success. Headers: text-xs mono uppercase muted. Data: text-sm text-primary. Rank and Day columns use Bebas Neue. Highlighted row (current user): accent-red/5 background tint.
- **Sort control:** Select dropdown with raised surface bg, mono uppercase styling.

### Proof Uploader

- **Shape:** Dashed border (`border-dashed`) in `--border`, rounded-lg, `background: var(--surface-raised)`, centered text. Padding 12px 16px.
- **States:** Default (muted text), hover (border → accent-red, text → primary), uploading (text says "Uploading..."), error (red alert text below). Thumbnail preview shown above the button when available.
- **Gallery fallback:** When `capture` is set (camera direct), a secondary text-only link appears below for gallery picker access.

### Day Counter

- **Layout:** Centered, top-to-bottom: mono label (Day), huge display number (accent-red / muted divider), gradient progress bar, date range.
- **Number:** Bebas Neue, responsive clamp from 3rem to 6rem. Count-up animation on mount (800ms, ease-out cubic). Current day in accent-red, slash + total in muted.
- **Progress bar:** 8px tall, rounded-full, max-width 28rem. Background: surface-raised. Fill: left-to-right gradient from accent-red to accent-orange. Width transition: 700ms ease.
- **Date range:** Mono 12px muted, flex-wrap.

### Journey Path

- **Layout:** Horizontal scroll container with keyboard arrow support. Tiles are 32×32px squares (rounded-sm) connected by a horizontal border line. Below each: gold triangle cursor on current day, mono day number at 10px.
- **Tile states:** Completed (success green), Failed (accent-red), Today (gold fill + 2px gold ring with 1px ring-offset), Future (border color), Not started (surface-raised).
- **Landmark markers:** Circle above tiles at milestone days. Earned: gold fill with ring. Upcoming: dashed border. Missed: muted border with reduced opacity.
- **Animation:** Current-day tile pulses with gold ring (2s ease-in-out infinite). Scroll-to-current on mount (smooth when motion allowed). Both respect `prefers-reduced-motion`.

### Podium Block

- **Layout:** Three columns, flex-end aligned. Order: 2nd | 1st | 3rd. Gaps: 4px mobile, 12px desktop.
- **Heights:** 1st (80px mobile, 112px desktop), 2nd (56px mobile, 80px desktop), 3rd (48px mobile, 64px desktop).
- **Colors:** Gold, silver, bronze themed borders and 10% bg tints. Rank number in Bebas Neue display, colored to match tier.
- **Empty state:** Dashed border placeholder with tier label below.

### Skeleton Loading

- **Pattern:** Shimmer animation on surface-raised base. Linear gradient sweep at 90deg through border-color highlight. 1.5s ease-in-out infinite loop.
- **Component-specific skeletons:** Every major component has a matching skeleton (TaskCardSkeleton, HeatmapGridSkeleton, LeaderboardTableSkeleton, etc.). Layout matches the live component exactly — same dimensions, same spacing, same border treatment. No generic "loading" spinners.
- **Animation respects `prefers-reduced-motion`** (stops shimmer, shows static placeholder).

## 6. Do's and Don'ts

### Do:

- **Do** use Habit Red (`#e63329`) as the sole interactive accent. One red for all primary actions, active states, and negative status signals.
- **Do** use JetBrains Mono uppercase at 10px with 0.15em tracking for all UI labels. Consistent label vocabulary across navigation, stats, badges, and form elements.
- **Do** use Bebas Neue for display numbers (day counter, podium ranks, leaderboard rank column). No other typeface for large numbers.
- **Do** use the surface ladder (base → surface → raised) for depth. No shadows on cards. Shadows only on primary buttons.
- **Do** ship a skeleton for every data-loading component. Match the live component's exact layout and dimensions.
- **Do** respect `prefers-reduced-motion: reduce` — animations must degrade to instant transitions, not disappear entirely.
- **Do** keep pages single-column, single-purpose. No side panels, no nested dashboards. Scroll, don't nest.
- **Do** use the gold palette only for earned/reward states. Gold is never decorative or pending.

### Don't:

- **Don't** introduce a second accent color. Habit Red is the only interactive color. Ember Orange exists only as a gradient endpoint on the progress bar.
- **Don't** use enterprise dashboard patterns — no nested data tables, no multi-widget layouts, no export-to-CSV energy.
- **Don't** use corporate wellness aesthetics — no pastel gradients, no zen/meditation vibes, no "your journey matters" platitudes.
- **Don't** use cartoonish over-gamification — no confetti cannons for trivial actions, no over-animated mascots. Gamification is grounded by proof submissions.
- **Don't** pair `border: 1px solid` with `box-shadow` blur ≥ 8px on the same element. Cards use borders. Buttons use shadows. Never both as decoration.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or list items. Use full borders, background tints, or nothing.
- **Don't** use gradient text (`background-clip: text`). Solid colors only for all text.
- **Don't** use Inter for UI labels or JetBrains Mono for body text. The font roles are fixed.
- **Don't** introduce a fourth typeface. Three families total: Bebas Neue, Inter, JetBrains Mono.
- **Don't** use display fonts (Bebas Neue) in buttons, labels, or data tables. Display is for big numbers only.
