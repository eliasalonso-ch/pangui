/**
 * Impresión del PDF de la solicitud MeConecta desde la card de la OT.
 *
 * Tabla ot_impresiones: la crea meconecta-scrape-cron junto con la OT, así que
 * solo las OTs de la integración (de ahora en adelante) tienen botón. RLS la
 * deja leer al workspace sin solicitantes; marcar va por marcar_ot_impresa().
 * Se trae el workspace completo de una vez (pocas filas), como las banderas.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";

export interface OTImpresion {
  pdfUrl: string;
  impresaAt: string | null;
  impresaPor: string | null;
}

const KEY = ["ot-impresiones"] as const;
/** Para refrescar los botones tras traer un PDF desde "Revisar MeConecta". */
export const OT_IMPRESIONES_KEY = KEY;

/**
 * orden_id → impresión.
 * @param ultimaOT created_at de la OT más nueva de la bandeja. Va en la key:
 * la OT de MeConecta llega por el poll de la lista con la pestaña abierta, y
 * sin esto el mapa no se volvía a pedir y la card salía sin botón hasta recargar.
 */
export function useOTImpresiones(enabled: boolean, ultimaOT: string | null) {
  return useQuery({
    queryKey: [...KEY, ultimaOT],
    enabled,
    staleTime: 60 * 1000,
    // Mientras baja el mapa nuevo, los botones de las demás cards no parpadean.
    placeholderData: keepPreviousData,
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
