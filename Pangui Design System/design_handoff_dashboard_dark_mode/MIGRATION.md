# Pangui v2 → Production: Migration guide

This is a step-by-step plan to land the v2 dashboard (in `ui_kits/app2/`) on
your existing Next.js codebase, **without breaking what works today**.

It's incremental — you should be able to ship after each step.

---

## TL;DR — the 5 changes

| # | What | Where | Effort |
|---|------|-------|--------|
| 1 | Replace token block | `app/globals.css` | 30 min |
| 2 | Add Tailwind theme tokens | `tailwind.config.js` | 15 min |
| 3 | Add theme script + bump density | `app/layout.js` | 10 min |
| 4 | Migrate components to tokens | `components/**` | half day |
| 5 | Add Apariencia tab | `app/(app)/configuracion/page.tsx` | 1 hr |

You don't have to do them in one go. Step 1+2+3 lights up dark mode globally
on the existing UI (it'll look weird in places where components hardcode hex
colors, which is exactly the inconsistency you wanted to fix). Step 4 is the
cleanup. Step 5 gives users the picker.

---

## Step 1 — Replace the token block in `app/globals.css`

Open `app/globals.css`. Find the `:root` + `.dark` blocks (lines ~13-78).
Replace them with the tokens from `ui_kits/app2/tokens.css` (copy that whole
file verbatim or paste its contents into `globals.css`).

### Why the change

Your current globals.css mixes two token systems:
- shadcn HSL variables (`--primary: 228 55% 35%;`) — for shadcn/ui
- raw hex variables (`--brand: #273D88`, `--mx-bg`, etc.) — for your custom code

The v2 system uses **a single set of CSS custom properties** with semantic
names (`--surface-1`, `--fg-1`, `--brand-tint`). Plain hex. No HSL math
in components.

### What to keep from your current globals.css

Your shadcn HSL vars are still needed by shadcn components (Button, Dialog,
etc.). Keep them. Add the v2 tokens **alongside**, then update the HSL values
to match the v2 palette so shadcn components inherit dark mode for free:

```css
/* In your existing :root block, replace shadcn values with: */
--background-hsl:        220 24% 98%;   /* was 0 0% 100% */
--foreground:            220 30% 11%;   /* matches --fg-1 */
--card:                  0 0% 100%;
--card-foreground:       220 30% 11%;
--primary:               228 55% 35%;   /* keep brand */
--primary-foreground:    0 0% 100%;
--muted:                 220 14% 96%;
--muted-foreground:      218 13% 47%;
--border:                220 14% 92%;
/* ...etc... */
```

And in your dark block, set the HSL equivalents of v2 dark tokens:

```css
[data-theme="dark"], .dark {
  --background-hsl: 220 47% 8%;    /* matches --surface-0 #0B1220 */
  --foreground:     217 35% 93%;   /* matches --fg-1 #E6EBF4 */
  --card:           220 41% 12%;   /* matches --surface-1 #111A2E */
  /* ...etc... */
}
```

(I can generate the full HSL-converted block as a follow-up if you want.)

### Key rename: `.dark` → `[data-theme="dark"]`

shadcn's default selector is `.dark`. v2 uses `[data-theme="dark"]`.
Two options:

**A.** Keep `.dark` — change v2 tokens to use `.dark` instead. Easier.
**B.** Switch to `data-theme` everywhere — also update shadcn's tailwind
config: `darkMode: ['class', '[data-theme="dark"]']`. Cleaner long-term.

Recommend **B**.

---

## Step 2 — Tailwind config

Add the v2 token names so Tailwind classes resolve to them.

```js
// tailwind.config.js
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'], // ← change here
  theme: {
    extend: {
      colors: {
        // v2 surface stack
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
        },
        fg: {
          1: "var(--fg-1)",
          2: "var(--fg-2)",
          3: "var(--fg-3)",
          4: "var(--fg-4)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover:   "var(--brand-hover)",
          tint:    "var(--brand-tint)",
          fg:      "var(--brand-fg)",
        },
        // semantic
        ...existingColors,
      },
      fontSize: {
        // v2 scale — note: base is now 14px
        "2xs":  "10px",
        "xs":   "11px",
        "sm":   "12px",
        "base": "14px",   // ← bumped from 13px
        "md":   "15px",
        "lg":   "16px",
        "xl":   "18px",
        "2xl":  "22px",
        "3xl":  "28px",
      },
      spacing: {
        // strict 4px scale — Tailwind already does this, keep as is
      },
      borderRadius: {
        // v2 defaults to 6-8px, not 0
        sm: "var(--r-sm)",  // 6px
        md: "var(--r-md)",  // 8px
        lg: "var(--r-lg)",  // 12px
      },
    },
  },
};
```

### Important: change `--radius` from `0rem` to `0.375rem`

Your current shadcn `--radius: 0rem` makes everything square. v2 uses 6-8px.
Bump it:

```css
:root { --radius: 0.375rem; /* 6px */ }
```

Yes, this is a visible change everywhere shadcn components are used. Expected.

---

## Step 3 — Theme script + base font size

In `app/layout.js`, replace the existing inline theme script with this
expanded version that handles `auto`:

```js
<script
  dangerouslySetInnerHTML={{
    __html: `
(function(){
  try {
    var t = localStorage.getItem("pangui_theme") || "auto";
    var resolved = t === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-pref", t);
  } catch(e) {}
})();
    `,
  }}
/>
```

Then bump the base font in `globals.css`:

```css
html, body { font-size: 14px; }  /* was 13px */
```

And listen for system theme changes — anywhere in client code (e.g. in your
`AppShell.js`):

```js
useEffect(() => {
  if (localStorage.getItem("pangui_theme") !== "auto") return;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = e => document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}, []);
```

---

## Step 4 — Migrate components

This is the slow part — and the part that fixes the inconsistencies you
complained about. The pattern:

### Before (your current `OTRow.tsx`)

```tsx
style={{
  background: isSelected ? "#F0F4FF" : "#fff",
  borderBottom: "1px solid #F1F3F5",
  borderLeft: isSelected ? "3px solid #273D88" : "3px solid transparent",
  ...
}}
```

### After

```tsx
className={cn("ot-row", isSelected && "ot-row--selected")}
```

```css
/* in OTRow.module.css OR globals */
.ot-row {
  background: var(--surface-1);
  border-bottom: 1px solid var(--divider);
  border-left: 3px solid transparent;
  transition: background 120ms var(--ease);
}
.ot-row:hover { background: var(--surface-hover); }
.ot-row--selected {
  background: var(--brand-tint);
  border-left-color: var(--brand);
}
```

**Rule:** any `style={{ background: "#..." }}`, `color: "#..."`, or
`borderColor: "#..."` in your codebase is a bug to fix. Search for `#` in
your `.tsx` files — every match should become a `var(--...)` reference.

### Suggested order

1. **AppSidebar.tsx** — most inline styles, biggest visual impact. Lift to
   `app.css` or a new `AppSidebar.module.css` using v2 tokens. ~2 hrs.
2. **OTRow.tsx** — same drill, ~1 hr.
3. **OTDetail.tsx** — bigger but mostly same pattern.
4. **Configuración** + **Login** — already mostly hex-based, lift them.
5. **landing.css** — landing has its own world (Tailwind utility-heavy +
   dark navy hero). It already works in both modes if you flip
   `--brand-light` → `var(--brand-tint)`. Cheap.

You can copy the entire v2 component CSS from `ui_kits/app2/app.css` and
use it as a reference / drop-in. The selectors are simple and
component-scoped (`.ot`, `.sb-item`, `.kpi`, etc.).

---

## Step 5 — Add the Apariencia tab

In `app/(app)/configuracion/page.tsx`, add an "Apariencia" tab to the
existing tab switcher. Copy the three-card picker from
`ui_kits/app2/PartesEquipoConfigNotifs.jsx` (`tab === "apariencia"` block).

Wire it to a tiny store:

```ts
function setTheme(pref: "light"|"auto"|"dark") {
  localStorage.setItem("pangui_theme", pref);
  const resolved = pref === "auto"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : pref;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-pref", pref);
}
```

Read the current pref from `data-theme-pref` to show which card is selected.

---

## Verification checklist before merging

- [ ] `localStorage.removeItem("pangui_theme")` then reload — page respects
      OS preference (light or dark depending on your system).
- [ ] Toggle system theme while app is open — dashboard switches live.
- [ ] Pick "Claro" in Apariencia, reload OS-dark — app stays light.
- [ ] Grep `\#[0-9A-Fa-f]{3,6}` in `app/(app)/**` — should return ~0 results.
- [ ] All shadcn primitives (Dialog, DropdownMenu, Sheet) still readable in
      dark mode.
- [ ] Landing page (`/`) still works (its dark navy hero is intentional, not
      dark-mode-dependent).

---

## Want me to do it?

Two options:

1. **You drive, I assist.** Ask me follow-ups as you go ("convert OTRow",
   "give me the HSL block for shadcn"). I'll generate exactly what you need.
2. **Claude Code handoff.** I can package this whole migration as a
   developer-handoff bundle — a zipped folder with the v2 files, the patches,
   and a `CLAUDE.md` that tells Claude Code exactly how to apply them. You
   drop it into your repo, fire up Claude Code, and it does the migration
   PR-by-PR.

Tell me which.
