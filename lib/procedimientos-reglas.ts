/**
 * Reglas de respuesta de pasos que no dependen de la UI: los estados que ofrece
 * el paso "Estado del activo" y la foto obligatoria. Espejo de
 * features/procedimientos/reglas.ts en la app móvil.
 */
import type { TipoPasoProc } from "@/types/procedimientos";

/** Estados que el técnico puede dejar desde una OT. "De baja" no: es una decisión de activo, no de terreno. */
export const ESTADOS_PASO = ["operativo", "mantencion", "fuera_servicio"] as const;

/** Pasos que adjuntan fotos a la respuesta: solo ahí aplica `foto_requerida` (en "imagen" la foto ES la respuesta). */
export const PASOS_CON_FOTO: TipoPasoProc[] = ["inspeccion", "si_no_na", "medidor"];

type RespConFotos = { foto_url?: string | null; valor_json?: unknown };

/**
 * ¿Al paso le falta la foto que exige `foto_requerida`? En inspección, cada
 * ítem ya evaluado necesita la suya; los que faltan por evaluar ya dejan el
 * paso sin responder por su cuenta.
 */
export function faltaFoto(
  paso: { tipo: TipoPasoProc; foto_requerida?: boolean },
  resp: RespConFotos | undefined,
): boolean {
  if (!paso.foto_requerida || !PASOS_CON_FOTO.includes(paso.tipo)) return false;
  const json = (resp?.valor_json ?? {}) as { items?: { result?: string; foto_urls?: string[] }[]; evidence_images?: unknown };
  if (paso.tipo === "inspeccion") {
    const items = json.items ?? [];
    return items.length === 0 || items.some(i => !!i.result && !(i.foto_urls?.length));
  }
  return !resp?.foto_url && !(Array.isArray(json.evidence_images) && json.evidence_images.length > 0);
}
