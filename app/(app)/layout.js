import AppShell from "./AppShell";
import AnalyticsIdentity from "./AnalyticsIdentity";
// Moved down from the root layout: TanStack Query serves authenticated data
// only, so mounting it at the root shipped it to marketing visitors too.
import { QueryProvider } from "../QueryProvider";

// No `title` here on purpose. Setting one made every authenticated page render
// "Pangui | Pangui": this value filled the root layout's "%s | Pangui" template
// and no page below overrode it. Each route now declares its own title (see the
// layout.js beside each page), so the tab reads "Órdenes | Pangui".
//
// robots: these pages sit behind auth and have nothing to rank; without this
// they inherit index:true from the root layout.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }) {
  return (
    <QueryProvider>
      <AnalyticsIdentity />
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
