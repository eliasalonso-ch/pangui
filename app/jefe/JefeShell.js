"use client";
import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";

export default function JefeShell({ children }) {
  return (
    <>
      <Topbar />
      <main className="sidebarMain" style={{ paddingBottom: "calc(var(--bottomnav-height) + 16px)" }}>{children}</main>
      <BottomNav />
    </>
  );
}
