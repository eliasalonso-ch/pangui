import JefeShell from "./JefeShell";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationPermission from "@/components/NotificationPermission";
import PrefetchRoutes from "@/components/PrefetchRoutes";

export const metadata = {
  title: "Pangui - Jefe Mantención",
};

const JEFE_ROUTES = [
  "/jefe",
  "/jefe/trabajo/nuevo",
  "/jefe/clientes",
  "/jefe/inventario",
];

export default function JefeLayout({ children }) {
  return (
    <>
      <PrefetchRoutes routes={JEFE_ROUTES} />
      <InstallPrompt />
      <NotificationPermission />
      <JefeShell>{children}</JefeShell>
    </>
  );
}
