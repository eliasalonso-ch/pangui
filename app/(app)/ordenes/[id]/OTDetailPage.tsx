"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import OTDetail from "../OTDetail";
import OTEditPanel from "../OTEditPanel";
import { deleteOrden } from "@/lib/ordenes-api";
import type {
  OrdenTrabajo, Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
} from "@/types/ordenes";

interface Props {
  initialOrden: OrdenTrabajo;
  usuarios:     Usuario[];
  ubicaciones:  Ubicacion[];
  lugares:      LugarEspecifico[];
  sociedades:   Sociedad[];
  activos:      Activo[];
  categorias:   CategoriaOT[];
  myId:         string;
  myRol:        string | null;
  wsId:         string;
}

export default function OTDetailPage({
  initialOrden, usuarios, ubicaciones, lugares, sociedades, activos, categorias,
  myId, myRol, wsId,
}: Props) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenTrabajo>(initialOrden);
  const [editOpen, setEditOpen] = useState(false);
  const rtRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Realtime: keep order fresh
  useEffect(() => {
    const sb = createClient();
    rtRef.current = sb
      .channel(`orden-detail-${orden.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ordenes_trabajo", filter: `id=eq.${orden.id}` },
        p => setOrden(prev => ({ ...prev, ...p.new as OrdenTrabajo })),
      )
      .subscribe();
    return () => { if (rtRef.current) sb.removeChannel(rtRef.current); };
  }, [orden.id]);

  const handleDelete = useCallback(async () => {
    await deleteOrden(orden.id);
    router.push("/ordenes");
  }, [orden.id, router]);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Back bar */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", height: 52,
          borderBottom: "1px solid #E5E7EB", background: "#fff", flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: 500, color: "#273D88",
            fontFamily: "inherit", padding: "4px 0",
          }}
        >
          <ArrowLeft size={16} />
          Órdenes
        </button>
      </div>

      {/* Detail fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {editOpen ? (
          <OTEditPanel
            orden={orden}
            usuarios={usuarios}
            ubicaciones={ubicaciones}
            lugares={lugares}
            sociedades={sociedades}
            activos={activos}
            categorias={categorias}
            myId={myId}
            wsId={wsId}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setOrden(prev => ({ ...prev, ...updated }));
              setEditOpen(false);
            }}
          />
        ) : (
          <OTDetail
            orden={orden}
            usuarios={usuarios}
            myId={myId}
            myRol={myRol}
            wsId={wsId}
            onEdit={() => setEditOpen(true)}
            onDelete={handleDelete}
            onClose={() => router.back()}
            onOrdenUpdated={(patch) => setOrden(prev => ({ ...prev, ...patch }))}
          />
        )}
      </div>
    </div>
  );
}
