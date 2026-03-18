import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationPermission from "@/components/NotificationPermission";

export const metadata = {
  title: "Pangi · Técnico",
};

export default function TecnicoLayout({ children }) {
  return (
    <>
      <InstallPrompt />
      <NotificationPermission />
      <Topbar />
      {children}
      <BottomNav />
    </>
  );
}
