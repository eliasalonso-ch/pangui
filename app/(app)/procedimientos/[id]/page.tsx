"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import ProcedimientoDetalle from "../ProcedimientoDetalle";

// La biblioteca (/procedimientos) ya muestra el detalle en su panel derecho.
// Esta ruta se mantiene para enlaces directos y para móvil: reutiliza el mismo
// componente en vez de duplicar el render de pasos y comportamiento.
export default function ProcedimientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await sb.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
      const rol = data?.rol;
      setIsAdmin(rol === "jefe" || rol === "admin" || rol === "owner");
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
        <button
          onClick={() => router.push("/procedimientos")}
          style={{
            display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 8px",
            background: "none", border: "none", borderRadius: 6, cursor: "pointer",
            color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={14} />
          Biblioteca de procedimientos
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ProcedimientoDetalle
          id={id}
          isAdmin={isAdmin}
          onEdit={() => router.push(`/procedimientos/${id}/editar`)}
        />
      </div>
    </div>
  );
}
