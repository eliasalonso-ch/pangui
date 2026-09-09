"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase";
import { useUbicacionesFull, useSociedadesFull } from "@/lib/queries";
import AppLoadingState from "@/components/AppLoadingState";

const MapaPosicionar = dynamic(() => import("@/components/ubicaciones/MapaPosicionar"), {
  ssr: false,
});

/**
 * Posicionar ubicaciones en el mapa.
 *
 * Vive en su propia ruta y no dentro de /ubicaciones porque necesita el ancho
 * completo: embebida entre la lista y el detalle, el mapa quedaba demasiado
 * angosto para hacer clic con precision.
 */
export default function MapaUbicacionesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [wsId, setWsId] = useState("");
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await getAuthUser();
        if (!user) { router.replace("/login"); return; }
        const sb = createClient();
        const { data: perfil } = await sb
          .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
        setWsId(perfil?.workspace_id ?? "");
        // Misma condicion que /ubicaciones: owner, admin o jefe.
        const rol = perfil?.rol;
        setPuedeEditar(rol === "owner" || rol === "admin" || rol === "jefe");
      } finally {
        setCargando(false);
      }
    })();
  }, [router]);

  const ubicacionesQ = useUbicacionesFull(wsId);
  const sociedadesQ = useSociedadesFull(wsId);

  const ubicaciones = ubicacionesQ.data ?? [];
  const sociedades = sociedadesQ.data ?? [];

  function invalidar() {
    for (const key of ["ubicaciones-full", "sociedades-full"]) {
      queryClient.invalidateQueries({ queryKey: [key, wsId] });
    }
    // Los pickers de otras pantallas leen la version corta del mismo dato.
    queryClient.invalidateQueries({ queryKey: ["ubicaciones"] });
  }

  if (cargando || ubicacionesQ.isLoading) return <AppLoadingState />;

  // Posicionar escribe en el catalogo: sin permiso, no hay nada que hacer aqui.
  if (!puedeEditar) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "var(--fg-3)" }}>
        No tienes permisos para editar ubicaciones.
      </div>
    );
  }

  const sinCoordenada = ubicaciones.filter(u => u.lat == null).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--surface-canvas)",
        }}
      >
        {/* Volver: texto plano, sin caja ni color de marca. El titulo que
            habia al lado ("Posicionar en mapa") era redundante — el mapa a
            pantalla completa ya dice donde estas. */}
        <button
          type="button"
          onClick={() => router.push("/ubicaciones/ubicaciones")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 32,
            padding: 0, background: "none", border: "none",
            cursor: "pointer", fontSize: 14, color: "var(--fg-1)", fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={14} />
          Ubicaciones
        </button>

        <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--fg-3)" }}>
          {sinCoordenada === 0
            ? "Todas las ubicaciones tienen coordenada"
            : `${sinCoordenada} sin coordenada de ${ubicaciones.length}`}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <MapaPosicionar
          ubicaciones={ubicaciones as any}
          sociedades={sociedades as any}
          onGuardado={invalidar}
        />
      </div>
    </div>
  );
}
