# Handoff: Pangui Landing Page Redesign

## Overview

Full redesign of the Pangui marketing landing page (`app/Landing.jsx`).
Direction: **editorial industrial**, inspired by slb.com — confident
typography on white, restrained use of one accent color (Pangui brand
blue `#273D88`), thin hairline rules instead of cards-with-shadows,
generous whitespace, full-bleed industrial photography as visual anchors.

The previous landing was a typical consumer-SaaS layout (gradients,
rounded cards, before/after splits, big-number stat strips, multiple
icon-coded sections). This redesign strips all of that.

The page stays in Spanish (Chile) and keeps all the substance of the
previous landing reflowed into 8 sections.

---

## About the Design Files

The files in this bundle (`Landing.jsx` + `landing.css`) **are
production-ready code** — written for Next.js 14+ App Router, Tailwind
v3, framer-motion. They drop directly into `C:\dev\pangui\app\` as
replacements for the existing `Landing.jsx` and `landing.css`.

Unlike most handoffs from the design system, this one is implementation —
not just specification — because the design was authored in the same
React+Tailwind stack the production app already uses.

---

## Fidelity

**High-fidelity (hifi).** All colors, type sizes, spacing, motion
timings, and section layouts are final and match the Pangui design
system tokens. Match exactly when reviewing the PR.

---

## Sections (in order)

The page is composed of **8 components**, all defined in `Landing.jsx`:

### 1. `LandingNav`
Fixed top nav. Transparent over the hero, swaps to white with a
backdrop blur and a `1px var(--hairline)` bottom border on scroll
(`window.scrollY > 12`). Left = wordmark. Center = 4 links (Plataforma,
Cumplimiento, Precios, FAQ). Right = "Iniciar sesión" text link +
"Probar gratis" pill (brand-blue fill, white text, hover `--accent-hover`).
Mobile hamburger expands a full-width sheet.

### 2. `Hero`
- White background.
- Top-left mono label `01 · Plataforma operacional` with a 32px accent rule.
- Display headline: "La mantención industrial, **en orden.**" — the last
  two words colored `var(--accent)`. Sizes: clamp 44px → 60px → 80px →
  104px (Inter Tight 700, tracking -0.025em, line-height 0.96).
- Subhead: 16-18px, ink-2, max-width 680px.
- Two CTAs: primary "Probar gratis" (brand-blue pill, 12px tall, 28px H)
  and ghost "Ver demo" with `arrow-up-right` icon.
- **Photo band below**: full-bleed wide aspect (21:10 mobile, 21:8 desktop).
  This is the visual anchor for the page. Caption strip below the photo
  with mono label + edition year.
- Photo source: Unsplash placeholder — **replace with licensed
  industrial photo before shipping**.

### 3. `TrustBand`
Single horizontal band. Mono label "Confían en Pangui" left, 6 client
logo placeholders (initials in display font, currently `text-[var(--ink-3)]`).
Replace placeholders with real SVG logos.

### 4. `CapabilitySection` (×4, alternating sides)
The four product capabilities — work orders, informes de terreno,
inventario, analítica. Each is a full-width section with:
- 5/7 column grid (copy left, image right). Sides alternate.
- Eyebrow row: 24px accent rule + `01 · Capability` mono label.
- Headline: Inter Tight 700, 36–52px, max-width 520px.
- Body: 2 paragraphs, 16px, ink-2, line-height 1.65.
- Outcomes list: 3 items, each a `01` mono numeral + label, separated
  by `1px var(--hairline)` top borders, last item gets a bottom border.
- Image: 5/4 aspect, single hairline caption below.
- Photos: Unsplash placeholders — **replace with licensed photos**.

### 5. `Compliance`
- Eyebrow `05 · Hecha para Chile`.
- Wide-set headline (max 820px): "Construida para operar en Chile, no
  traducida del inglés."
- Subhead.
- 4-up grid of compliance items below: SII / Ley 21.719 / Offline-first
  PWA / Trazabilidad. Hairline-grid layout (`gap-px bg-var(--hairline)
  border var(--hairline)`). Each cell: lucide icon top in accent, then
  20px display title, then 14px body in ink-2.

### 6. `Pricing`
- Eyebrow `06 · Precios`. Headline left, intro paragraph right (12-col grid).
- Three-column slim table:
  - **Gratis** — ghost outline button. Hover: button fills with brand blue.
  - **Pro** — `is-recommended` class. The tier name gets a small accent
    underline (`.pangui-underline::after`). Button is brand-blue filled.
  - **Enterprise** — ghost outline button. Same hover treatment.
- No "Más popular" badge. Underline does the job.
- Features lists use a tiny horizontal hairline marker (not a checkmark
  icon) before each line.
- Bottom footnote about CLP / IVA / cancelation.

### 7. `FAQ`
- 5/7 column grid. Headline left, accordion right.
- Each FAQ row: `01.` mono numeral in accent, then question label in ink.
- Plus/minus icon on the right (lucide `Plus` / `Minus`).
- Hairline `var(--hairline-strong)` between rows.
- Accordion animation: framer-motion height 0 → auto, 320ms,
  cubic-bezier(0.2, 0.7, 0.3, 1).

### 8. `LandingFooter`
- White background, dark text. Border-top hairline.
- 4-column / 8-column grid. Left = wordmark, tagline, edition label.
- Right = 3 columns: Producto / Empresa / Legal.
- ARCO link is emphasized (underlined with `--accent` decoration).
- Bottom row: copyright + version mono label.

---

## Interactions & Behavior

- **Scroll-triggered fade-in**: every section uses
  `motion.div variants={fadeUp} whileInView="visible" viewport={{ once: true }}`.
  18px Y translate + opacity, 700ms, cubic-bezier(0.2, 0.7, 0.3, 1).
- **CTA hover**: brand blue → `--accent-hover` (`#1F316E`), 200ms transition.
- **Outlined buttons (pricing non-recommended)**: hover fills with
  `--accent`, text inverts to white. Border color matches background.
- **FAQ accordion**: only one open at a time. Click open → click again
  closes. Plus icon rotates to Minus.
- **Nav scroll state**: `scrolled` truthy when `window.scrollY > 12`.
  Adds white background + backdrop blur + bottom hairline.
- **Reduced motion**: `landing.css` has a `@media (prefers-reduced-motion)`
  rule that nulls transitions and animations.

---

## Design Tokens

All tokens live in `landing.css` as CSS custom properties scoped to
`.landing-root`. **No hex codes in JSX** — everything goes through these:

### Color

| Token | Value | Use |
|---|---|---|
| `--accent` | `#273D88` | The Pangui brand blue. Sole accent color. Eyebrow rules, FAQ numerals, Compliance icons, Pricing underline, focus rings, ARCO link decoration, **all primary CTAs** |
| `--accent-hover` | `#1F316E` | Hover state for blue buttons |
| `--bg-page` | `#FFFFFF` | Every surface (no cream, no off-white) |
| `--ink` | `#0A0B0D` | Primary text |
| `--ink-2` | `rgba(10, 11, 13, 0.65)` | Secondary text (body paragraphs) |
| `--ink-3` | `rgba(10, 11, 13, 0.45)` | Muted text (mono labels, captions) |
| `--ink-4` | `rgba(10, 11, 13, 0.25)` | Decorative |
| `--hairline` | `rgba(10, 11, 13, 0.10)` | Default section borders, grid dividers |
| `--hairline-strong` | `rgba(10, 11, 13, 0.18)` | Pricing-row + FAQ-row dividers |

### Type

| Token | Family | Loaded from |
|---|---|---|
| `--font-display` | Inter Tight | Google Fonts via `@import` in landing.css |
| `--font-body` | Inter | Google Fonts |
| `--font-mono` | JetBrains Mono | Google Fonts |

Use Tailwind utilities `font-display`, `font-mono`, or `font-sans`
(default body). All defined in the `tailwind.config.js` fontFamily
section in your existing config; if not, add:

```js
fontFamily: {
  display: ['"Inter Tight"', 'sans-serif'],
  sans:    ['"Inter"', 'sans-serif'],
  mono:    ['"JetBrains Mono"', 'monospace'],
}
```

### Scale (per-element, Tailwind arbitrary values)

Hero headline: `text-[44px] sm:text-[60px] md:text-[80px] lg:text-[104px]`
Section H2: `text-[36px] md:text-[44px] lg:text-[52px]` (capability),
          `text-[36px] md:text-[48px] lg:text-[56px]` (pricing/compliance)
Section subhead: `text-[16px] md:text-[18px]`
Body paragraphs: `text-[14px]` or `text-[16px]`
Mono labels: `text-[10px]` or `text-[11px]`, `tracking-[0.18em]`,
            `uppercase`, `font-mono`

Tracking standards:
- Display headlines: `tracking-[-0.025em]` (tight)
- Capability/Compliance H3: `tracking-[-0.015em]`
- Mono labels: `tracking-[0.18em]` (wide uppercase)
- FAQ numerals: `tracking-[0.14em]`

### Motion

- `fadeUp` variant: opacity 0 → 1, y +18 → 0, 700ms, ease `[0.2, 0.7, 0.3, 1]`.
- `stagger` variant: `staggerChildren: 0.08`.
- All transitions: 200ms color/background. No scale, no rotate (except
  hover icon translate-x on arrows).

---

## Assets

Logos already in `/public/` (existing):
- `pangui-logo.svg` — color wordmark (used everywhere in this redesign).
- `pangui-logo-white.svg` — NOT used in this redesign (we're all-light).

**Placeholder photos** — Unsplash URLs in `Landing.jsx`. **You must
replace these before production**:

| Where | Current URL | Suggested swap |
|---|---|---|
| Hero | `photo-1581094794329-c8112a89af12` | Real photo of a Pangui client technician with tablet on-site |
| Capability 01 (OT) | `photo-1581092580497-e0d23cbdf1dc` | Operator with tablet at work-order |
| Capability 02 (Informes) | `photo-1565008447742-97f6f38c985c` | Technician documenting on phone |
| Capability 03 (Inventario) | `photo-1586528116311-ad8dd3c8310d` | Labeled parts/stock shelving |
| Capability 04 (Analítica) | `photo-1551288049-bebda4e38f71` | Dashboard / monitoring screen |

Self-host these in `/public/landing/` and update the `src=` paths.

Trust band logos: currently text initials (CLC, UST, STRM, MDN, EV, GO).
Replace with real SVG client logos when available.

---

## Files in this bundle

| Path | What it is |
|---|---|
| `README.md` | This document — full spec for the redesign |
| `CLAUDE.md` | Claude Code working instructions (read this if you're an LLM) |
| `Landing.jsx` | The production component. Drop into `app/Landing.jsx`. ~990 lines |
| `landing.css` | Companion stylesheet with tokens + Google Fonts import. Drop into `app/landing.css` |
| `CHANGELOG.md` | What I removed from the previous landing and why |

---

## Definition of done

- [ ] `app/Landing.jsx` and `app/landing.css` replaced; existing files backed up
- [ ] No new dependencies added (framer-motion + lucide-react already in `package.json`)
- [ ] Page renders identically to the design preview (a screenshot
      comparison is in the conversation thread that produced this handoff)
- [ ] WCAG AA: every body text contrast ratio ≥ 4.5:1 verified
- [ ] All 5 placeholder Unsplash photos replaced with licensed/owned imagery
- [ ] Trust band logos replaced with real client logos (or the section
      hidden if you don't have them yet)
- [ ] Mobile viewport (≤ 640px) reviewed manually — section layouts
      stack as designed
- [ ] FAQ accordion: click open, click again to close, only one open
      at a time
- [ ] Nav background swap fires correctly when scrolling past 12px
- [ ] `prefers-reduced-motion` honored — no entry animations when set
- [ ] Build succeeds in Next.js production mode (`next build`)

---

## What this redesign removed from the previous landing

See `CHANGELOG.md` for the full list. Key removals:

1. The "Sin Pangui / Con Pangui" before/after split
2. The 4-step `HowItWorks` numbered section
3. The Testimonials section (recommend re-introducing as a single
   editorial pull-quote between capabilities when you have on-brand
   client photos)
4. The 4-stat hero strip ("−70% / 100% / 1 clic / Offline")
5. The standalone email-capture `FinalCTA` section
6. The Sun/Moon/Monitor theme toggle on the nav (theme switching now
   lives only inside the app shell, not the landing)
7. Per-feature color coding (purple/emerald/sky/orange/yellow). The
   landing now uses one accent — Pangui brand blue.
