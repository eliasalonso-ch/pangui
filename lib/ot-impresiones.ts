/**
 * Impresión del PDF de la solicitud MeConecta desde la card de la OT.
 *
 * Tabla ot_impresiones: la crea meconecta-scrape-cron junto con la OT, así que
 * solo las OTs de la integración (de ahora en adelante) tienen botón. RLS la
 * deja leer al workspace sin solicitantes; marcar va por marcar_ot_impresa().
 * Se trae el workspace completo de una vez (pocas filas), como las banderas.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";

export interface OTImpresion {
  pdfUrl: string;
  impresaAt: string | null;
  impresaPor: string | null;
}

const KEY = ["ot-impresiones"] as const;

/** orden_id → impresión. */
export function useOTImpresiones(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, OTImpresion>> => {
      const { data, error } = await createClient().from("ot_impresiones").select("orden_id, pdf_url, impresa_at, impresa_por");
      if (error) throw error;
      return new Map((data ?? []).map(r => [r.orden_id as string, {
        pdfUrl: r.pdf_url as string,
        impresaAt: (r.impresa_at as string | null) ?? null,
        impresaPor: (r.impresa_por as string | null) ?? null,
      }]));
    },
  });
}

/**
 * Abre el diálogo de impresión con el PDF, sin pestaña intermedia: se baja como
 * blob (el CDN de R2 permite CORS desde la app) y se imprime desde un iframe
 * oculto. Si el navegador no lo permite, se abre el PDF en una pestaña.
 */
// ponytail: iframe + print() funciona en Chrome/Edge/Firefox; Safari a veces
// imprime en blanco y cae al fallback de pestaña.
export async function imprimirPdf(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PDF ${res.status}`);
    const blobUrl = URL.createObjectURL(await res.blob());
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    await new Promise<void>((resolve) => { iframe.onload = () => resolve(); });
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // El diálogo puede seguir abierto un rato: se limpia después.
    window.setTimeout(() => { iframe.remove(); URL.revokeObjectURL(blobUrl); }, 60_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Marca la OT como impresa (la primera impresión manda). Va aparte de
 * imprimirPdf(): el navegador no dice si el diálogo terminó en imprimir o en
 * cancelar, así que la card pregunta y solo marca con un "Sí".
 */
export function useMarcarImpresa() {
  const qc = useQueryClient();
  return async (ordenId: string) => {
    const { error } = await createClient().rpc("marcar_ot_impresa", { p_orden_id: ordenId });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: KEY });
  };
}
