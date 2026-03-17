import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";

export const metadata = {
  title: "Pangi · Técnico",
};

export default function TecnicoLayout({ children }) {
  return (
    <>
      <Topbar />
      {children}
      <BottomNav />
    </>
  );
}
