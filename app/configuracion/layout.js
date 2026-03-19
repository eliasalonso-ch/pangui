import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";

export const metadata = {
  title: "Pangui - Configuración",
};

export default function ConfiguracionLayout({ children }) {
  return (
    <>
      <Topbar />
      <main className="sidebarMain">{children}</main>
      <BottomNav />
    </>
  );
}
