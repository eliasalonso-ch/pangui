// Titles the tab for this section. The root layout's "%s | Pangui" template
// renders this as "Mi cuenta | Pangui"; without it the page falls back to the
// site-wide default. A layout is used because the page is a client component
// and cannot export `metadata` itself.
export const metadata = { title: "Mi cuenta" };

export default function AccountLayout({ children }) {
  return children;
}
