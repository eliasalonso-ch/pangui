// Titles the tab for this section. The root layout's "%s | Pangui" template
// renders this as "Analítica de materiales | Pangui"; without it the page falls back to the
// site-wide default. A layout is used because the page is a client component
// and cannot export `metadata` itself.
export const metadata = { title: "Analítica de materiales" };

export default function MaterialsAnalyticsLayout({ children }) {
  return children;
}
