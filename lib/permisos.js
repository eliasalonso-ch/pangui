"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * usePermisos()
 *
 * Fetches the current user's module permissions from `permisos_usuario`.
 * When no row exists for a module, access is granted by default (true).
 * Admins always have access to all modules regardless of stored rows.
 *
 * Returns:
 *   permisos  — raw map { modulo: boolean } | null (null = still loading)
 *   puedeVer  — fn(modulo) → boolean
 *   userRol   — string | null
 */
export function usePermisos() {
  const [permisos, setPermisos] = useState(null); // null = loading
  const [userRol, setUserRol] = useState(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPermisos({}); return; }

      // Fetch role + permissions in parallel
      const [{ data: perfil }, { data: rows }] = await Promise.all([
        supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle(),
        supabase.from("permisos_usuario").select("modulo, puede_ver").eq("usuario_id", user.id),
      ]);

      setUserRol(perfil?.rol ?? null);

      const map = {};
      (rows ?? []).forEach(({ modulo, puede_ver }) => {
        map[modulo] = puede_ver;
      });
      setPermisos(map);
    }

    load();
  }, []);

  function puedeVer(modulo) {
    // Admin and jefe always see everything
    if (userRol === "admin" || userRol === "jefe") return true;
    // Still loading → show optimistically to avoid layout flicker
    if (permisos === null) return true;
    // Default true if no row exists
    return permisos[modulo] !== false;
  }

  return { permisos, puedeVer, userRol };
}
