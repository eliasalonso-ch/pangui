import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationPermission from "@/components/NotificationPermission";
import PrefetchRoutes from "@/components/PrefetchRoutes";

export const metadata = {
  title: "Pangui · Técnico",
};

const TECNICO_ROUTES = [
  "/tecnico",
  "/tecnico/inventario",
];

export default function TecnicoLayout({ children }) {
  return (
    <>
      <PrefetchRoutes routes={TECNICO_ROUTES} />
      <InstallPrompt />
      <NotificationPermission />
      <Topbar />
      <main>{children}</main>
      <BottomNav />
    </>
  );
}
