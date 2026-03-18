import JefeShell from "./JefeShell";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationPermission from "@/components/NotificationPermission";

export const metadata = {
  title: "Pangi · Jefe mantención",
};

export default function JefeLayout({ children }) {
  return (
    <>
      <InstallPrompt />
      <NotificationPermission />
      <JefeShell>{children}</JefeShell>
    </>
  );
}
