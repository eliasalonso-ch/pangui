// Overrides the parent "Configuración" title for this nested route, so the tab
// reads "Suscripción | Pangui" rather than inheriting the section name.
export const metadata = { title: "Suscripción" };

export default function SubscriptionSettingsLayout({ children }) {
  return children;
}
