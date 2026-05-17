# Claude Code: Pangui dashboard redesign + dark mode

You are helping implement a designed redesign of the Pangui CMMS dashboard. Your goal is to land the design from this handoff bundle (in the `design_handoff_dashboard_dark_mode/` folder you're sitting in, or wherever the user placed it) onto the live Next.js codebase.

## Read these first

1. `README.md` — full design specification, tokens, screens, behaviors.
2. `MIGRATION.md` — the executable 5-step plan. Follow it in order.
3. `design_files/index.html` — the runnable preview. **Open it in a browser** to see what you're building. Click the sun/auto/moon toggle in the topbar and the sidebar items to traverse every screen in both modes.

## How the user wants you to work

- **PR-by-PR, not one giant change.** Each step in `MIGRATION.md` should be a separate commit (or PR if they're working that way). Stop and check in with the user between steps.
- **Verify dark mode works after every step.** Don't move to the next step if the previous one broke the existing UI in dark.
- **Don't touch the landing page** (`app/page.js` + `app/landing.css`). Its dark navy hero is intentional and not dark-mode-dependent. Out of scope.
- **Don't rewrite Supabase queries, realtime subscriptions, or exports.** This is a visual/UX redesign only.

## Codebase facts (verify before touching)

- Framework: Next.js 16, App Router, React 19.
- Styling: Tailwind CSS + shadcn/ui + CSS Modules.
- Icons: `lucide-react` (already installed).
- Auth/DB: Supabase.
- Theme storage key: `pangui_theme` (already used by existing toggle in `app/login/page.js`).
- Existing theme switch is partial — there's a Sun/Moon/Monitor button in login and the landing nav, but the actual `data-theme` attribute is set only at first-paint via `app/layout.js`. No proper system listener. Step 3 of `MIGRATION.md` fixes that.

## Step order (from MIGRATION.md)

1. **Tokens.** Replace the `:root` + `.dark` blocks in `app/globals.css` with the contents of `design_files/tokens.css`. Reconcile with the existing shadcn HSL vars — keep them, but derive their values from v2 hex tokens so shadcn components inherit dark mode. **Also change `--radius: 0rem` → `0.375rem`** and `font-size: 13px` → `14px` on `html, body`.
2. **Tailwind config.** In `tailwind.config.js`, change `darkMode: ["class"]` → `["class", '[data-theme="dark"]']`. Extend the theme colors with v2 token aliases (`surface`, `fg`, `brand.tint`, `brand.fg`).
3. **Theme script.** In `app/layout.js`, replace the existing inline pre-paint script with the expanded version that handles `"auto"` and falls through to `prefers-color-scheme`. Add a global listener (in a client component like `AppShell.js`) that updates `data-theme` live when OS theme changes — but only when the user's preference is `"auto"`.
4. **Migrate components.** This is the bulk of work — translate inline-styled components (`OTRow.tsx`, `OTDetail.tsx`, `AppSidebar.tsx`, `configuracion/page.tsx`, `OrdenesBandeja.tsx`) so every hex color, padding, and font-size is replaced with a CSS custom property or Tailwind class that resolves to one. Use the `design_files/app.css` as your reference for component-by-component styling.
5. **Add Apariencia tab.** In `app/(app)/configuracion/page.tsx`, add an "apariencia" tab (use the existing tab pattern in that file). Implement the 3-card picker from `design_files/PartesEquipoConfigNotifs.jsx` (the `tab === "apariencia"` block). Wire it to `localStorage.setItem("pangui_theme", ...)` + `document.documentElement.setAttribute("data-theme", ...)`.

## What "done" looks like

Run through this checklist before declaring done:

- [ ] User clears `localStorage` → app respects OS theme on next load.
- [ ] Toggle OS theme while app is open in auto mode → app updates live.
- [ ] Pick "Oscuro" in Configuración → Apariencia → persists across reload.
- [ ] `grep -rE "#[0-9A-Fa-f]{3,6}" app/(app)/` ideally returns 0 results.
- [ ] All shadcn primitives (Dialog, DropdownMenu, Sheet, Tooltip) readable in dark mode.
- [ ] No flash of light theme on initial page load when dark mode is active.
- [ ] All six screens (Inicio, Órdenes, Partes, Equipo, Configuración, Notificaciones) visually match `design_files/index.html`.
- [ ] Existing Supabase realtime subscriptions still work.
- [ ] Existing exports (PDF, Excel) still work.

## Things to NOT do

- Don't add new dependencies. Everything you need is already in `package.json` (`framer-motion`, `lucide-react`, `tailwindcss-animate`).
- Don't bring the React-in-browser JSX from `design_files/` into the production app directly — those are design references. Reimplement as Next.js client components.
- Don't change the URL structure or routes. The redesign is per-route, not a restructure.
- Don't replace shadcn primitives wholesale. They work; they just need their tokens to point at v2 values.
- Don't introduce new patterns the user said no to: command palette, breadcrumbs, right-side inspector, floating + button, draggable bento, topbar tabs. They explicitly opted out.

## Ask the user before

- Changing data fetching logic.
- Adding/removing routes.
- Touching `app/page.js` (landing).
- Anything that's not in `MIGRATION.md`.

## When in doubt

Re-read `README.md` § "Design Tokens" and § "Screens / Views". They have the exact values, sizes, and treatments for every visible element.

Good luck.
