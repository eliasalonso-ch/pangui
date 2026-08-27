// Titles the tab for this section. The root layout's "%s | Pangui" template
// renders this as "Configuración | Pangui"; without it the page falls back to the
// site-wide default. A layout is used because the page is a client component
// and cannot export `metadata` itself.
export const metadata = { title: { default: "Configuración", template: "%s | Pangui" } };

export default function SettingsLayout({ children }) {
  return children;
}
