import AppShell from "./AppShell";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationPermission from "@/components/NotificationPermission";
import PrefetchRoutes from "@/components/PrefetchRoutes";

export const metadata = {
  title: "Pangui",
};

const APP_ROUTES = [
  "/ordenes",
  "/partes",
  "/activos",
  "/usuarios",
];

export default function AppLayout({ children }) {
  return (
    <>
      <PrefetchRoutes routes={APP_ROUTES} />
      <InstallPrompt />
      <NotificationPermission />
      <AppShell>{children}</AppShell>
    </>
  );
}
