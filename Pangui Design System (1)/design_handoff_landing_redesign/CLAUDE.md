# Claude Code: Pangui landing redesign

You're helping land a redesigned marketing landing page on the Pangui
codebase. This is a **drop-in replacement** for two files, not a
multi-step migration.

## Read first

1. `README.md` — full design spec (tokens, sections, motion, assets).
2. `CHANGELOG.md` — what was removed from the previous landing and why.
3. `Landing.jsx` and `landing.css` — the deliverables. Look at them
   before opening the user's repo.

## What you're shipping

Replace exactly two files in the Pangui repo:

```
app/Landing.jsx   →  this bundle's Landing.jsx
app/landing.css   →  this bundle's landing.css
```

That's the whole change. **No** `package.json` edits, **no** Tailwind
config edits beyond a possible `fontFamily` entry, **no** new routes,
**no** new components.

## Steps

### 1. Back up the existing files

```bash
cp app/Landing.jsx app/Landing.jsx.bak
cp app/landing.css app/landing.css.bak
```

### 2. Drop in the new files

```bash
cp <handoff>/Landing.jsx app/Landing.jsx
cp <handoff>/landing.css app/landing.css
```

### 3. Verify Tailwind config

Open `tailwind.config.js`. Confirm the `theme.extend.fontFamily` section
includes the three families used by the redesign:

```js
fontFamily: {
  display: ['"Inter Tight"', 'sans-serif'],
  sans:    ['"Inter"', 'sans-serif'],
  mono:    ['"JetBrains Mono"', 'monospace'],
}
```

If `display` and `mono` aren't there, add them. Don't replace existing
`sans` if it's already pointing at something Pangui uses elsewhere in
the app — the landing only needs `font-display` and `font-mono` to work.
The Google Fonts `@import` in `landing.css` loads the actual font files.

### 4. Smoke-test locally

```bash
npm run dev
```

Open `http://localhost:3000/`. Confirm:
- Hero renders with the headline "La mantención industrial, en orden."
  with the last two words colored `#273D88`.
- Scrolling triggers fade-in on each section.
- "Probar gratis" buttons are filled brand blue, not dark.
- FAQ accordion opens/closes; plus/minus toggles.
- Mobile (resize to ≤ 640px) — sections stack, nav becomes a hamburger.

### 5. Replace the placeholder photos

The `Landing.jsx` file has 5 `images.unsplash.com` URLs:
- 1 in the Hero
- 4 in the `CAPABILITIES` array (one per capability section)

Search for `images.unsplash.com` in `Landing.jsx` to find them. The
recommended replacement paths are in `README.md` under "Assets". If
the user hasn't provided licensed photos yet, **flag it** and ask
before merging — these are placeholders, not production assets.

### 6. Replace the trust band logos

The `TrustBand` component uses text initials (CLC, UST, etc.) as logo
placeholders. Replace with real SVG logos when the user provides them.
If they don't have logos yet, ask whether to keep placeholders or hide
the section.

### 7. Build check

```bash
npm run build
```

Should succeed without warnings (one expected warning from the in-browser
Babel reference in our preview file is not relevant to production).

## What to NOT touch

- `app/page.js` — that's the route that imports `Landing`. It should
  already import from `./Landing.jsx`. Don't change it.
- The app shell, login page, dashboard, or any non-landing code.
- The token system in the dashboard (separate concern, separate handoff
  if there is one).
- `framer-motion` version (locked to whatever the user has).
- `lucide-react` version.

## Things to confirm with the user before merging

1. **The 5 placeholder photos** — they're Unsplash, not Pangui-owned.
   You must not ship to production with these. Ask the user for licensed
   images or have them temporarily host their own.
2. **Trust band logos** — placeholder text initials need real client
   SVG logos.
3. **Removed sections** (see `CHANGELOG.md`):
   - "Sin Pangui / Con Pangui" before/after split — gone
   - HowItWorks 4-step section — gone
   - Testimonials — gone
   - Hero stat strip ("−70% / 100% / 1 clic / Offline") — gone
   - Email-capture FinalCTA — gone
   - Sun/Moon/Monitor theme toggle on nav — gone

   If the user wants any of these back, ask before re-introducing — the
   redesign deliberately strips them for editorial discipline.

## Things to NOT do

- Don't introduce gradients, rounded card shadows, glassmorphism, or
  animated particles. The whole point of this redesign is to avoid that
  consumer-SaaS look.
- Don't add color-coded sections (purple/emerald/sky/orange/yellow).
  The accent is `#273D88` only.
- Don't change the typography stack. Inter Tight + Inter + JetBrains Mono.
- Don't add testimonials or "as featured in" rows.
- Don't add a "Most popular" badge on the Pro pricing tier — the small
  accent underline (`.pangui-underline::after` in `landing.css`) is the
  intentional replacement.

## Accessibility checks

- All body text contrast ratios ≥ 4.5:1 against white (`#0A0B0D` text =
  fine; `--ink-2` at rgba(0.65) ≈ 4.9:1)
- All interactive elements keyboard-reachable
- FAQ buttons have `aria-expanded`
- Nav menu toggle has `aria-label`
- Focus rings defined in `landing.css` — 2px accent outline, 3px offset

## When in doubt

The design preview that produced these files is in the conversation
thread (search for `Landing-preview.html`). Match it.

Good luck.
