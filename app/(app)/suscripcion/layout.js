// Titles the tab for this section. The root layout's "%s | Pangui" template
// renders this as "Suscripción | Pangui"; without it the page falls back to the
// site-wide default. A layout is used because the page is a client component
// and cannot export `metadata` itself.
export const metadata = { title: "Suscripción" };

export default function SubscriptionLayout({ children }) {
  return children;
}
