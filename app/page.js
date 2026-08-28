import Landing from "./Landing";
import { faqStructuredData } from "./structured-data";

// og:url lives here rather than in the root layout: set there it was inherited
// by every page, so subpages advertised the homepage as their Open Graph URL
// while canonicalising to themselves. This page is the one it was ever correct
// for. Matches the root layout's canonical of "/".
export const metadata = {
  openGraph: { url: "https://getpangui.com" },
};

// The FAQPage node describes THIS page (the "Preguntas frecuentes" section in
// Landing.jsx), so it is emitted here rather than site-wide from the layout.
//
// suppressHydrationWarning is required, not cosmetic: PostHog injects its
// loader <script> into <body> before hydration, so React tries to reconcile
// THIS script tag against PostHog's and reports a mismatch. The same reason is
// why the site-wide JSON-LD lives in <head> (see app/layout.js). Suppressing
// here is safe — the tag is static, inert, and never re-rendered.
export default function Home() {
  return (
    <>
      <Landing />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
    </>
  );
}
