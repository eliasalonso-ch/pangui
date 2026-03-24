"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";

export default function AppShell({ children }) {
  // Track last activity (throttled to once per 5 min)
  useEffect(() => {
    const KEY = "pangui_last_active_ts";
    const now = Date.now();
    const last = parseInt(sessionStorage.getItem(KEY) || "0");
    if (now - last < 300000) return;
    sessionStorage.setItem(KEY, String(now));
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) sb.from("usuarios").update({ last_active: new Date().toISOString() }).eq("id", user.id).then(() => {});
    });
  }, []);

  return (
    <>
      <main className="sidebarMain">{children}</main>
      <BottomNav />
    </>
  );
}
