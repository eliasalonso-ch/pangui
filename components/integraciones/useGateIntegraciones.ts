"use client";

import { useEffect, useState } from "react";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import { puedeVerIntegraciones } from "@/lib/integraciones";

/**
 * Same gate as the sidebar item, so a typed URL doesn't get around it. With
 * `slug`, the page of one integration: also checks it is available to this
 * workspace (MeConecta is Electrilam/UdeC only).
 */
export function useGateIntegraciones(slug?: string): "cargando" | "permitido" | "denegado" {
  const [gate, setGate] = useState<"cargando" | "permitido" | "denegado">("cargando");
  useEffect(() => {
    let activo = true;
    getPerfilUsuario().then((p) => {
      if (activo) setGate(puedeVerIntegraciones(p?.workspace_id, p?.rol, slug) ? "permitido" : "denegado");
    });
    return () => { activo = false; };
  }, [slug]);
  return gate;
}
