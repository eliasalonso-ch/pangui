import AppShell from "./AppShell";
import AnalyticsIdentity from "./AnalyticsIdentity";

export const metadata = {
  title: "Pangui",
};

export default function AppLayout({ children }) {
  return (
    <>
      <AnalyticsIdentity />
      <AppShell>{children}</AppShell>
    </>
  );
}
