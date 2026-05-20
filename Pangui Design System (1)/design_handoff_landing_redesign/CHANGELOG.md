# Pangui landing — Redesign changelog

> Source: previous `app/Landing.jsx` (1,363 lines)
> Output: new `Landing.jsx` (~700 lines) + `landing.css` (~80 lines)
> Direction: SLB-inspired editorial industrial. Dark, restrained, type-led.

## Files

- **`Landing.jsx`** — drop into `app/Landing.jsx` (or wherever your existing
  one lives). Single self-contained component file.
- **`landing.css`** — drop alongside it. Imports Inter Tight (display) + Inter
  (body) + JetBrains Mono (accents) from Google Fonts. Defines the accent
  color CSS var and a handful of utilities.

## Section mapping (old → new)

| Old section | New section | Notes |
|---|---|---|
| LandingNav | LandingNav | Transparent over hero; solid + blur on scroll; lost the brand-blue background; lost theme toggle (not appropriate for this editorial direction — propose moving to login/app shell only) |
| Hero | Hero | Full-bleed photo + dark gradient. Headline reflowed to 8 words ("La mantención industrial, en orden."); subhead trimmed to 24 words. Single primary CTA + single ghost "Ver demo" link. Stats strip removed (anti-SaaS-cliché) |
| ProblemSolution (before/after) | **Removed** | This split-card pattern is the consumer-startup tell we wanted to avoid. The "outcomes" lists inside each Capability section now carry the same information without the gimmick |
| Features (8-icon list) | Collapsed into 4 **CapabilitySections** | Work orders, Informes de terreno (was: signatures + photos), Inventario, Analítica. Each = full-width editorial spread with headline + 2 body paragraphs + 3 numbered outcomes + one large image. Alternates sides |
| HowItWorks (4 steps) | **Removed** | The 4-step process is now implicit in the OT capability section copy. The big-numeral watermark trope is overused; SLB doesn't do it |
| Testimonials | **Removed** for now | Per SLB direction (corporate-industrial > consumer-startup). Recommend reintroducing as a small editorial pull-quote inside one capability section once you have on-brand portrait photos. I left a comment-friendly slot |
| TrustSignals | **Compliance section** | Promoted to its own dedicated section (was a 4-icon strip). Now reads as a credibility statement — SII, Ley 21.719, offline-first, trazabilidad — with longer editorial copy |
| Pricing | Pricing | Same 3 tiers, same prices. **No "Más popular" badge** — replaced with a single accent underline under "Pro". Card shadows and rounded corners removed; thin black hairline divides columns instead. Tiers ship as a slim 3-col table |
| FAQ | FAQ | Now on dark. Numerical prefixes (`01.`, `02.`...) in monospace accent color, per spec. Plus/minus toggles instead of chevrons. Long hairline rules between rows |
| FinalCTA | **Folded into Hero + Pricing** | The standalone "email capture" CTA was a SaaS-funnel pattern, not industrial-editorial. The primary CTA in the hero and each pricing card already do this job. If you need the email capture, it lives on `/registro` |
| LandingFooter | LandingFooter | Tightened to 3 columns (was 4) per spec. Wordmark + tagline column on the left, then Producto / Empresa / Legal. ARCO link emphasized (underlined, white) within Legal |

## What was preserved

- All Spanish copy that translates idiomatically. Headlines reworked for
  editorial cadence (shorter, punctuated, less "growth-hack")
- Three pricing tiers + exact prices (0 / 8.000 / "A convenir")
- All 5 FAQs (one rewritten for clarity on Ley 21.719)
- The four capabilities (OT / Fotos+Firma / Inventario / Analítica) — now
  presented as full editorial sections instead of icon cards
- Legal links (privacidad, terminos, arco) and contact methods (WhatsApp,
  email)

## What changed visually

- **Color palette** — was multicolor (purple, emerald, sky, orange, yellow,
  brand blue, accent green). Now: near-black `#0A0B0D` + white +
  single accent `#4F8BFF` used sparingly (eyebrow rules, FAQ numerals,
  compliance icons, hero highlight word, pricing underline). No
  per-feature color coding
- **Typography** — was Inter (regular) + Geist. Now: **Inter Tight** for
  display (semibold/bold, tight tracking), **Inter** for body, **JetBrains
  Mono** for accent labels and FAQ numerals
- **Cards & shadows** — all `border-radius` removed except where critical
  for interaction affordance. All `box-shadow` removed. Cards replaced by
  thin black/10 or white/10 hairline rules
- **Gradients** — were used heavily (hero, CTA, gradient text). Now: a
  single subtle gradient overlay on hero photo for legibility. No card
  gradients, no gradient text
- **Section rhythm** — was alternating white / `#f8fafc` (close together).
  Now: clear alternation between near-black and white, with `border-t`
  hairlines marking each transition
- **Numbering** — `01·02·03...` monospace prefixes throughout (hero corner,
  eyebrows, FAQ, outcomes list) for the editorial / technical feel
- **Animation** — kept Framer Motion but limited to `fade + 18px y`
  on scroll-in, no staggered icon entrances, no pulse glows, no
  WhatsApp-specific CTA buttons

## Images

The hero, the four capability sections, all use placeholder Unsplash URLs
(real industrial photos). They are stable image IDs, but **production
should self-host these or license appropriate images**. The relevant URLs
are in `Landing.jsx` near each `<img src=>` — search for `images.unsplash.com`
to find them.

Suggested replacements:
- Hero — technician with tablet in industrial setting (oil/plant/MEP)
- Section 01 (OT) — operator with iPad showing a work order
- Section 02 (Informes) — technician documenting on phone
- Section 03 (Inventario) — labeled shelving/parts
- Section 04 (Analítica) — dashboard on monitor in operations room

## Accessibility

- WCAG AA contrast: all body text on dark = `#FFFFFF/65–80%` against
  `#0A0B0D` → ≥ 7:1. Body on white = `#0A0B0D/65–80%` against white →
  ≥ 7:1
- Focus rings: 2px accent outline, 3px offset, defined in `landing.css`
  for all interactive elements
- All interactive elements keyboard-reachable (semantic `<a>` / `<button>`)
- ARIA labels on icon-only buttons (menu toggle), `aria-expanded` on FAQ
- `prefers-reduced-motion` honored — disables Framer Motion's transforms

## Carryover / removed dependencies

Imports trimmed from 30 lucide-react icons to 7:
`ArrowRight, ArrowUpRight, Plus, Minus, Menu, X, Wifi, FileCheck2, ShieldCheck, ScrollText`

Removed: theme toggle (Sun/Moon/Monitor) — propose moving theme switching
to the app shell, not the landing. The previous landing carried a theme
toggle that didn't fit the editorial direction.

Removed: framer-motion `useScroll`/`useTransform` import (was added during
drafting; landing doesn't need it). If you want scroll-linked parallax
later, it's there.

## How to ship

```bash
# from C:\dev\pangui
cp <handoff>/Landing.jsx app/Landing.jsx
cp <handoff>/landing.css app/landing.css
npm run dev
```

Tailwind config: no changes required. The file uses only utilities that
ship in default Tailwind v3 plus `text-balance` (v3.3+, already in your
`package.json` per the source landing).

`framer-motion` and `lucide-react`: already in `package.json`. No new deps.

## Open questions / things I'd ask before merge

1. **The hero photo** — you'll want a Pangui-licensed, Chile-specific image
   (a real client site if possible). The Unsplash placeholder is a generic
   industrial worker
2. **Trust band logos** — the placeholder text initials need real SVG logos
   from your existing clients
3. **Testimonials** — gone for now. If you want them back, the cleanest
   place is a single editorial pull-quote between sections 02 and 03,
   styled as a large mono+sans block with the customer's name and role
4. **Theme toggle** — confirmed removed from landing. Keeping it on
   `/login` and inside the app shell. Tell me if you want a slim dark/light
   switch in the footer instead
