"use client";

import { useEffect, useState } from "react";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import { puedeVerIntegraciones } from "@/lib/integraciones";

/** Same gate as the sidebar item, so a typed URL doesn't get around it. */
export function useGateIntegraciones(): "cargando" | "permitido" | "denegado" {
  const [gate, setGate] = useState<"cargando" | "permitido" | "denegado">("cargando");
  useEffect(() => {
    let activo = true;
    getPerfilUsuario().then((p) => {
      if (activo) setGate(puedeVerIntegraciones(p?.workspace_id, p?.rol) ? "permitido" : "denegado");
    });
    return () => { activo = false; };
  }, []);
  return gate;
}
