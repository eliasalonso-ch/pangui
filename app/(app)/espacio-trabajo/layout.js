// Titles the tab for this section. The root layout's "%s | Pangui" template
// renders this as "Espacio de trabajo | Pangui"; without it the page falls back to the
// site-wide default. A layout is used because the page is a client component
// and cannot export `metadata` itself.
export const metadata = { title: "Espacio de trabajo" };

export default function WorkspaceLayout({ children }) {
  return children;
}
