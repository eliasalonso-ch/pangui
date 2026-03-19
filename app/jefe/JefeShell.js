"use client";
import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";

export default function JefeShell({ children }) {
  return (
    <>
      <Topbar />
      <main>{children}</main>
      <BottomNav />
    </>
  );
}
