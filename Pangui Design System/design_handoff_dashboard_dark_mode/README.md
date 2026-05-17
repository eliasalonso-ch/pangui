# Handoff: Pangui Dashboard Redesign + Dark Mode

## Overview

This package redesigns the Pangui CMMS dashboard (post-login experience) with two goals:

1. **Eliminate visual inconsistencies** in colors, spacing, density, and hover states.
2. **Add dark mode** — soft slate/navy palette, system-aware by default, with manual override.

The redesign covers all six post-login screens: Inicio (dashboard), Órdenes (split list + detail), Partes (inventory table), Equipo (team grid), Configuración (with new Apariencia tab), and Notificaciones.

It also covers shared chrome: sidebar, topbar, theme toggle, and all base primitives (buttons, pills, avatars, tables, cards, search).

---

## About the Design Files

The files in `design_files/` are **HTML+CSS+React design references** — runnable mockups showing the intended look, behavior, and tokens. They are **not production code to copy directly** into the Pangui codebase.

The task is to **recreate these designs in the existing Pangui codebase** (Next.js 16 + React 19 + Tailwind + shadcn/ui + lucide-react) using its established patterns. The CSS tokens (`tokens.css`) and component styles (`app.css`) are the closest thing to "drop-in" — those CSS files can be adapted directly. The `.jsx` files use vanilla React-in-browser (Babel-in-the-page) and must be re-implemented as proper Next.js client components.

The `MIGRATION.md` file at the root of this bundle has a concrete 5-step migration plan; **start there**.

---

## Fidelity

**High-fidelity (hifi).** All colors, spacing, type sizes, line heights, radii, shadows, transitions, and hover/active states are final. Match them pixel-perfectly when reasonable. Use the existing codebase libraries — shadcn/ui primitives (Button, Dialog, DropdownMenu, Sheet, Tabs, Tooltip), lucide-react for icons, Tailwind utility classes — but follow the token names and visual treatments defined here.

---

## How to use this bundle

1. **Read `MIGRATION.md` first** — it's the executable plan. Five steps, in order.
2. **Open `design_files/index.html`** in a browser. Click the sun/auto/moon toggle in the top right to see light, system-auto, and dark modes. Click each sidebar item to see all six screens.
3. **Use `design_files/tokens.css` as the source of truth for design tokens.** Copy it into `app/globals.css` (replacing the existing token block) or adapt to your preferred format. Every other style in the system derives from these tokens.
4. **Use `design_files/app.css` as the reference component stylesheet.** Either lift the rules into existing CSS Modules or rewrite the relevant ones as Tailwind utility classes — your call.

---

## Screens / Views

### 1. Sidebar (shell, applies to all screens)

- **Width:** 224px, fixed.
- **Background:** `var(--sidebar-bg)` = `#FFFFFF` (light) / `#0D1525` (dark).
- **Border-right:** 1px `var(--border)`.
- **Brand block:** Logo image, 22px tall, padded 12px both sides. Logo swaps via CSS: `pangui-logo.svg` in light, `pangui-logo-white.svg` in dark.
- **Group label:** Tiny uppercase eyebrow ("Trabajo", "Sistema"), `font-size: 10px`, weight 700, tracked 0.14em, color `var(--fg-4)`.
- **Nav items:** 38px tall, 18px lucide icon + 14px label, gap 12px. Idle = `color: var(--fg-2)`, icon `var(--fg-3)`. Hover = background `var(--sidebar-hover)`, text `var(--fg-1)`. Active = background `var(--brand-tint)`, text and icon `var(--brand-fg)`, font-weight 600. Optional red `.badge` (circular, danger color, white text, 18px).
- **User card (bottom):** Padded 12px, 1px `var(--border)` border, 8px radius. Avatar 32px + name (14px semibold) + role (11px muted) + chevron-right. Hover: surface lift.
- **Items (in order):** Inicio (home icon), Órdenes (clipboard-list, badge "3"), Partes (boxes), Equipo (users), Notificaciones (bell), Configuración (settings).

### 2. Topbar (shell, applies to all screens)

- **Height:** 56px.
- **Background:** `var(--surface-1)`.
- **Border-bottom:** 1px `var(--border)`.
- **Padding:** 0 24px.
- **Layout:** flex, space-between.
- **Left:** Title (Inter, 18px, bold, tracking -0.02em) + optional sub (12px, muted).
- **Right (`.topbar-actions`):** flex gap 8px.
  - Search icon button (lucide `search`, 36×36, ghost, opens command palette ⌘K — not implemented yet).
  - Bell icon button.
  - **Theme toggle:** segmented control, pill-shaped, 3 buttons (sun / monitor / moon), 28×28 each. Active = white card with shadow-xs in light, lifted surface in dark.
  - Any screen-specific actions (e.g., "Nueva OT", "Exportar").

### 3. Inicio (Dashboard) — `nav === "inicio"`

- **Page padding:** 24px, max-width 1200px center.
- **KPI strip:** 4 cards, grid-template-columns repeat(4, 1fr), gap 16px.
  - Each card: `var(--surface-1)`, 1px `var(--border)`, 8px radius, padding 20px.
  - Label: 11px semibold uppercase tracked 0.06em, color `var(--fg-3)`.
  - Value: Inter 36px bold, tracking -0.02em, tabular-nums.
  - Delta: 11px, with optional `trending-up`/`trending-down` lucide icon, colored `var(--success)` / `var(--danger)` / `var(--fg-3)`.
  - First card uses `.kpi.brand` variant: background `var(--brand-tint)`, value color `var(--brand-fg)`, no border.
- **Chart card:** 1.4fr column. Header = "Órdenes por día" + "Últimos 30 días" muted. Right = 3-button segmented chart-tabs (14d / 30d / 90d). SVG area chart 720×180 with gradient fill (`var(--brand)` at 32% → 0%), 2px stroke, dot at each data point.
- **Stock crítico card:** 1fr column. Lists 3 parts. Each row: 8px red dot + name (14px semibold) + sku (11px mono muted) + qty (right-aligned, mono, bold, red) + "mín X" (10px muted).
- **Recent activity card:** Wide, list of 4 OT rows. Each row: code (mono, 90px) + title (14px, 1fr) + status pill + 24px avatar + relative time (right, 50px).

### 4. Órdenes — `nav === "ordenes"`

- **Tabs row below topbar:** 4 tabs (Todas, Mías, Vencidas, Cerradas) with counts. Active = `var(--brand)` border-bottom + `var(--brand-fg)` text + semibold. Counts use pill-style background.
- **Split layout:** `grid-template-columns: 480px 1fr`, full height.
- **Left pane (list):**
  - List header: padding 20px. Title "Órdenes" (Inter 18 bold) + count pill.
  - Controls row: Search (`<Search/>` with `/` kbd shortcut) + 2 icon buttons (filters, sort).
  - Rows (`.ot`): 16px padding, divider bottom. Selected = `var(--brand-tint)` background + 3px `var(--brand)` left border.
  - Row layout: top row (code + optional overdue chip), title (15px semibold, 2-line clamp), bottom row (status pill, priority pill, location with map-pin icon, then right: time + AvatarStack).
- **Right pane (detail):**
  - Scrollable. Max-width 920px center.
  - **Header:** Code + 28px title + Editar/Iniciar buttons.
  - **Meta grid card:** 3 columns × 2 rows. Each cell: label (10px uppercase tracked) + value (with optional icon prefix).
  - **Descripción card:** 14px paragraph, fg-2 color, line-height 1.55.
  - **Checklist card:** "Checklist" header + "2 de 5 completados" sub. Each item: 18px checkbox + label. Done = checkbox filled `var(--success)` with white check icon, label `var(--fg-3)` strikethrough.
  - **Partes usadas card:** Grid rows, name + qty (×N, mono) + price (right, mono).
  - **Actividad card:** Avatar + bolded user + text + relative time.

### 5. Partes — `nav === "partes"`

- **Max-width 1200px center.**
- **Search + filter row.**
- **Category chips:** Pill buttons, 6px radius (overridden to pill), 6px V × 14px H. Active = `var(--brand)` solid fill.
- **Table card** (`.card.card-pad-0`): full data table.
  - Header row: `var(--surface-0)` background, uppercase tracked column labels.
  - Body rows: hover = `var(--surface-hover)`. Stock column right-aligned mono, colored red/orange/default based on status.
  - Status pill: uses generic `.pill` with inline `background`/`color` from semantic tokens (`--danger-bg`, `--warning-bg`, `--success-bg`).

### 6. Equipo — `nav === "equipo"`

- **3-column card grid**, gap 16px.
- Each team card: large avatar (44px) + name + role + disposition pill (colored dot + label). Then a 2-column stats grid (Activas / Cerradas mes), then 2 action buttons (Mensaje / Perfil).
- Hover: `var(--border-strong)` + `--shadow-sm`.

### 7. Configuración — `nav === "configuracion"`

- **2-column layout:** 220px nav column + content column.
- Nav items styled identically to sidebar (`.cfg-nav .item`).
- **Apariencia tab** (the key new addition): 3 picker cards (Claro / Auto / Oscuro), each with a mini theme preview tile, label, description. Selected = 2px brand border + check icon. Click triggers `setTheme(opt.k)`.
- **Cuenta tab:** FormRow components — uppercase tracked label + input box (uses `.searchbar` style with height 40).
- Other tabs: stubbed with empty states. Implement per current Pangui needs.

### 8. Notificaciones — `nav === "notificaciones"`

- **Max-width 760px center.**
- **List inside a card.** Each notif row: 36px icon tile (`.notif-ic.brand|danger|warning|success|neutral`) + body (bold first segment + rest) + relative time.
- Unread rows: `var(--brand-tint)` background.

---

## Interactions & Behavior

### Theme switching

- 3 modes: **light**, **auto** (follows OS via `prefers-color-scheme`), **dark**.
- Stored in `localStorage` key `pangui_theme`. Default = `"auto"`.
- Applied via `<html data-theme="...">` attribute. `auto` resolves to `light` or `dark` at runtime by reading the media query.
- Pre-paint inline script in `<head>` to avoid flash of wrong theme — see `MIGRATION.md` step 3.
- Listen to `matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ...)` when in auto mode.

### Hover rule (universal — applies to every interactive surface)

1. **Idle:** base background.
2. **Hover:** background bumps to `var(--surface-hover)` (4% darker in light, 4% lighter in dark). Border doesn't change. Cursor: pointer.
3. **Active / selected:** background `var(--brand-tint)`, optional 3px `var(--brand)` left bar (for list items) or color-shift to `var(--brand-fg)` (for nav).
4. **Focus-visible:** 2px `var(--brand)` outline, 2px offset, 4px border-radius.

### Transitions

- Color/background: `120ms cubic-bezier(.2,.7,.3,1)` (defined as `--dur-fast var(--ease)`).
- No transitions on text size, layout, or position.
- Avoid bouncy springs and parallax. The app is businesslike, not playful.

### Status & priority pills

- **Status pills** carry color (open=blue, wait=orange, progress=green, review=cyan, done=green, cancel=gray).
- **Priority pills** are outlined (1px solid currentColor), not filled. Color shifts by level (low=neutral, medium=blue, high=orange, urgent=red).
- In dark mode, status pills use tinted-glass treatment: 16% alpha colored background, brighter foreground text.

### Sidebar nav badge

- Red circular badge for unread/urgent counts. Reserved for high-signal items (e.g., 3 overdue orders).

---

## State Management

State needed for the dashboard chrome and screens:

- `theme: "light" | "auto" | "dark"` — persisted to localStorage, syncs `<html data-theme>`.
- `nav: string` — active route key (already handled by Next.js router; `usePathname()` replaces local state).
- Per-screen state: selected OT (Órdenes), active category (Partes), active config tab (Configuración). All local-component state, no global store needed.

Data fetching is unchanged — the redesign is purely visual/UX. Existing Supabase queries from your current code apply.

---

## Design Tokens

All tokens live in `design_files/tokens.css`. Reproduced here for reference.

### Surfaces

| Token            | Light       | Dark        | Use |
|------------------|-------------|-------------|-----|
| `--surface-0`    | `#F7F8FA`   | `#0B1220`   | Page background |
| `--surface-1`    | `#FFFFFF`   | `#111A2E`   | Cards, panels |
| `--surface-2`    | `#FFFFFF`   | `#1A2541`   | Elevated popovers, dropdowns |
| `--surface-hover`| `#F1F4F8`   | `#19223A`   | Hover state on any surface |
| `--surface-active`| `#E9EEF6`  | `#1F2C4C`   | Pressed/active state |
| `--sidebar-bg`   | `#FFFFFF`   | `#0D1525`   | Sidebar (slightly darker than page in dark) |
| `--sidebar-hover`| `#F4F6FA`   | `#14203A`   | Sidebar nav hover |

### Borders

| Token              | Light       | Dark        |
|--------------------|-------------|-------------|
| `--border`         | `#E5E8EE`   | `#1F2B47`   |
| `--border-strong`  | `#D5DAE3`   | `#2B3A5C`   |
| `--divider`        | `#EEF0F4`   | `#1A2540`   |

### Foreground (text)

| Token       | Light       | Dark        | Use |
|-------------|-------------|-------------|-----|
| `--fg-1`    | `#0F1729`   | `#E6EBF4`   | Primary text |
| `--fg-2`    | `#4A5568`   | `#A6B0C4`   | Secondary text |
| `--fg-3`    | `#6B7689`   | `#7682A0`   | Muted text |
| `--fg-4`    | `#9AA3B5`   | `#586278`   | Disabled, meta |
| `--fg-on-brand` | `#FFFFFF` | `#FFFFFF` | Text on brand fill |

### Brand

| Token            | Light       | Dark        |
|------------------|-------------|-------------|
| `--brand`        | `#273D88`   | `#4A66C4`   |
| `--brand-hover`  | `#1F316E`   | `#5A78D4`   |
| `--brand-active` | `#18254F`   | `#6F8AE0`   |
| `--brand-fg`     | `#273D88`   | `#8DA4E8`   | (use this when brand color is text-on-surface, not a fill) |
| `--brand-tint`   | `#EEF1FB`   | `rgba(74, 102, 196, 0.14)` |
| `--brand-tint-2` | `#DCE3F6`   | `rgba(74, 102, 196, 0.22)` |

### Status (pills)

Each status has a `-bg`, `-fg`, `-dot` triplet. See `tokens.css`. Names: `open`, `wait`, `progress`, `review`, `done`, `cancel`.

### Priority

- `--pr-low`, `--pr-medium`, `--pr-high`, `--pr-urgent`

### Semantic

- `--success` / `--success-bg`
- `--warning` / `--warning-bg`
- `--danger` / `--danger-bg`
- `--info` / `--info-bg`

### Spacing (4px scale, strict)

`--sp-1` (4) through `--sp-16` (64). Use these instead of arbitrary px values.

### Radii

- `--r-xs: 4px` — checkboxes
- `--r-sm: 6px` — buttons, inputs
- `--r-md: 8px` — cards (default)
- `--r-lg: 12px` — hero cards
- `--r-xl: 16px` — large containers
- `--r-pill: 9999px` — pills, avatars

### Shadows

- `--shadow-xs` — base card hint
- `--shadow-sm` — dropdowns
- `--shadow-md` — popovers, modals
- `--shadow-lg` — overlays
- `--shadow-glow` — focus / featured cards

In dark mode, shadows shift to use higher alpha black instead of slate.

### Motion

- `--ease: cubic-bezier(.2,.7,.3,1)` — single easing across the system.
- `--dur-fast: 120ms` — hover/color transitions.
- `--dur-base: 180ms` — opacity, transforms.
- `--dur-slow: 280ms` — page-level transitions.

### Typography

- Heading font: **Inter** (weights 400–900). Used for titles and KPI values.
- Body font: **Geist** (weights 400–700). Used everywhere else.
- Mono font: **Geist Mono**. Used for OT codes (`OT-00042`), SKUs, tabular numbers.

Scale:

| Token       | Size    | Use |
|-------------|---------|-----|
| `--fs-2xs`  | 10px    | Eyebrow labels, table column heads |
| `--fs-xs`   | 11px    | Pills, meta, time stamps |
| `--fs-sm`   | 12px    | Tertiary UI, captions |
| `--fs-base` | 14px    | **Default body** (was 13px in v1) |
| `--fs-md`   | 15px    | List item titles |
| `--fs-lg`   | 16px    | Card titles |
| `--fs-xl`   | 18px    | Topbar title |
| `--fs-2xl`  | 22px    | Section heads |
| `--fs-3xl`  | 28px    | Detail-page title |
| `--fs-4xl`  | 34px    | Page hero (rare in app, common in landing) |

Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 900 (black).
Tracking: `-0.02em` (`--tr-tight`) on headings, `0.06em` (`--tr-wide`) on labels, `0.14em` (`--tr-mega`) on uppercase eyebrows.

---

## Assets

Logos (already in your codebase at `public/`):
- `pangui-logo.svg` — color wordmark for light backgrounds.
- `pangui-logo-white.svg` — white wordmark for dark backgrounds. **Already exists in your repo.**
- `logo.svg` — isotipo (P + star) for the collapsed sidebar.

Icons: **lucide-react** (already a dependency in `package.json`). Sizes used in the design: 14px (small inline), 16px (buttons), 18px (sidebar), 20–22px (feature blocks). Stroke width default (2).

No new images needed.

---

## Files in this bundle

| Path | What it is |
|------|-----------|
| `MIGRATION.md` | **Start here.** Step-by-step plan to apply the redesign to the live Next.js codebase. |
| `design_files/index.html` | Runnable React-in-browser preview of all six redesigned screens. Open in a browser. |
| `design_files/tokens.css` | **The source of truth for design tokens.** Light + dark + auto. |
| `design_files/app.css` | Component styles using only tokens. Reference for translation to Tailwind classes / CSS Modules. |
| `design_files/Shell.jsx` | Sidebar + topbar + theme toggle component. |
| `design_files/Components.jsx` | Shared primitives: Btn, IconBtn, StatusPill, PriorityPill, Avatar, AvatarStack, Search, Empty. |
| `design_files/Inicio.jsx` | Dashboard screen. |
| `design_files/Ordenes.jsx` | Órdenes split-view screen with OT row + detail. |
| `design_files/PartesEquipoConfigNotifs.jsx` | Partes, Equipo, Configuración, Notificaciones screens. |
| `design_files/assets/` | Logo SVGs for the preview. |

---

## Definition of done

- [ ] User can clear their stored theme and the app respects OS theme.
- [ ] Toggling OS theme while app is open updates the dashboard live (auto mode).
- [ ] Pressing "Oscuro" in Configuración → Apariencia persists and overrides OS.
- [ ] `grep -r "#[0-9A-Fa-f]\{3,6\}" app/(app)/` returns ~0 matches.
- [ ] All shadcn primitives (Dialog, DropdownMenu, Sheet, Tooltip) are readable in both modes.
- [ ] No flash of light theme on initial page load in dark.
- [ ] All six screens visually match the corresponding screen in `design_files/index.html`.
- [ ] Existing functionality (Supabase queries, realtime, exports) unchanged.

---

## Questions for the developer

If anything is ambiguous, the priority order is:

1. **Token names + values** are non-negotiable. Match them exactly.
2. **Hover rule** (idle → surface-hover → brand-tint) applies everywhere. Don't invent new hover states.
3. **Density** — 14px base, ~72px OT row, 4px spacing scale. Don't shrink.
4. **Spanish copy** stays Chilean Spanish, sentence case for screen titles, uppercase eyebrows. Don't translate.

Everything else (animation timing, exact icon choices, table sort logic, etc.) is up to you.
