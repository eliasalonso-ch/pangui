"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { fetchOrden } from "@/lib/ordenes-api";
import type { OrdenTrabajo, Usuario } from "@/types/ordenes";
import OTDetail from "@/app/(app)/ordenes/OTDetail";

/**
 * Ficha de OT en modal, para abrir una orden desde los catálogos.
 *
 * Es el MISMO modal que usan las vistas de calendario y kanban en la bandeja
 * (ver `OrdenesBandeja.tsx`): mismo fondo, mismo ancho de 960px, mismo
 * `OTDetail` adentro. Se comparte para que abrir una OT se sienta igual en toda
 * la app en vez de mandar al usuario a otra página y perder el contexto.
 *
 * A diferencia de la bandeja, acá el contexto (usuarios, rol, workspace) no está
 * cargado, así que el modal lo pide al abrirse. `OTDetail` necesita la OT
 * completa, no la fila liviana de la lista, y `fetchOrden` además respeta la
 * visibilidad de "solo asignadas".
 */
export default function OTModal({ ordenId, onClose }: {
  ordenId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenTrabajo | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ctx, setCtx] = useState<{ myId: string; myRol: string; wsId: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignorar = false;
    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error("Sesión expirada");

        const { data: perfil } = await sb
          .from("usuarios")
          .select("workspace_id, rol")
          .eq("id", user.id)
          .maybeSingle();
        if (!perfil?.workspace_id) throw new Error("Sin espacio de trabajo");

        const [detalle, { data: equipo }] = await Promise.all([
          fetchOrden(ordenId),
          sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", perfil.workspace_id),
        ]);
        if (ignorar) return;
        if (!detalle) throw new Error("No se encontró la orden");

        setOrden(detalle);
        setUsuarios((equipo ?? []) as Usuario[]);
        setCtx({ myId: user.id, myRol: perfil.rol, wsId: perfil.workspace_id });
      } catch (e) {
        if (!ignorar) setError((e as Error).message);
      } finally {
        if (!ignorar) setCargando(false);
      }
    }
    void cargar();
    return () => { ignorar = true; };
  }, [ordenId]);

  // Esc cierra, igual que cualquier otro modal de la app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Orden de trabajo"
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--surface-1)", borderRadius: 14,
          width: "min(960px, 100%)", height: "calc(100vh - 48px)", maxHeight: "calc(100vh - 48px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
          overflow: "hidden",
        }}
      >
        {cargando ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 8, color: "var(--fg-4)", fontSize: 14 }}>
            <Loader2 size={16} className="animate-spin" />
            Cargando…
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)" }}>{error}</div>
            <button
              onClick={onClose}
              style={{
                height: 34, padding: "0 14px", border: "1px solid var(--border)",
                borderRadius: "var(--r-md)", background: "var(--surface-1)",
                fontSize: 14, fontWeight: 400, color: "var(--fg-2)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cerrar
            </button>
          </div>
        ) : orden && ctx ? (
          <OTDetail
            orden={orden}
            usuarios={usuarios}
            myId={ctx.myId}
            myRol={ctx.myRol}
            wsId={ctx.wsId}
            onClose={onClose}
            showCloseButton
            /* Editar y eliminar viven en la bandeja, que es la que tiene los
               paneles y el catálogo cargados. Desde acá se deriva allá con la
               OT abierta en vez de duplicar todo ese armado en el catálogo. */
            onEdit={() => router.push(`/ordenes?id=${ordenId}`)}
            onDelete={() => router.push(`/ordenes?id=${ordenId}`)}
            onOpenOrden={id => router.push(`/ordenes?id=${id}`)}
            onOrdenUpdated={patch => setOrden(prev => (prev ? { ...prev, ...patch } : prev))}
          />
        ) : null}
      </div>
    </div>
  );
}
