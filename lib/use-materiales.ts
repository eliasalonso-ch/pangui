"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchAlias, fetchUsos, todoElCatalogo, tieneCobros } from "@/lib/catalogo-api";
import type { Material, Uso } from "@/lib/materiales-busqueda";

const VACIO_A = new Map<string, string>();
const VACIO_U = new Map<string, Uso>();
const VACIO_C: Material[] = [];

/** Catálogo + alias + usos, cargados una vez: la búsqueda corre en el navegador. */
export function useMateriales(workspaceId: string | null | undefined) {
  const on = !!workspaceId && tieneCobros(workspaceId);
  const cat = useQuery({ queryKey: ["materiales", "catalogo", workspaceId], queryFn: () => todoElCatalogo(workspaceId!), enabled: on, staleTime: Infinity });
  const ali = useQuery({ queryKey: ["materiales", "alias", workspaceId], queryFn: () => fetchAlias(workspaceId!), enabled: on, staleTime: 10 * 60_000 });
  const uso = useQuery({ queryKey: ["materiales", "usos", workspaceId], queryFn: fetchUsos, enabled: on, staleTime: 10 * 60_000 });
  return {
    catalogo: (cat.data as Material[] | undefined) ?? VACIO_C,
    alias: ali.data ?? VACIO_A,
    usos: uso.data ?? VACIO_U,
    listo: cat.isSuccess,
  };
}
