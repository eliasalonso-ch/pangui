/**
 * Búsqueda y orden del picker de materiales (Electrilam). Sin dependencias:
 * este archivo se copia IGUAL en pangui-native-sdk57/lib (como hoja-formulas.ts),
 * y lo usan la grilla web, la bandeja de pendientes y el picker de mobile.
 *
 * Orden: código exacto → lo que más usa este maestro (lo reciente pesa más) →
 * lo que usa el equipo → alfabético por código.
 */
import { codigosDeTexto } from "./cobros-diccionario";

export interface Material { codigo: string; descripcion: string; unidad: string; clasificacion: string }
/** Usos por código (en minúsculas), de la RPC material_usos. */
export interface Uso { codigo: string; mios: number; equipo: number; ultimo_mio: string | null }

const MEDIA_VIDA_DIAS = 90;
const PESO_EQUIPO = 0.1;

export function normMaterial(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Columnas Material y Código por label (las hojas web tienen ids aleatorios). */
export function columnasMaterial(columnas: { id: string; label: string }[]): { material: string; codigo: string } | null {
  const id = (...labels: string[]) => columnas.find((c) => labels.includes(normMaterial(c.label)))?.id;
  const material = id("material", "item", "descripcion");
  const codigo = id("codigo");
  return material && codigo ? { material, codigo } : null;
}

function puntaje(u: Uso | undefined, ahora: number): number {
  if (!u) return 0;
  const dias = u.ultimo_mio ? Math.max(0, (ahora - Date.parse(u.ultimo_mio)) / 86400000) : Infinity;
  const mios = u.mios * Math.pow(0.5, dias / MEDIA_VIDA_DIAS);
  return mios + u.equipo * PESO_EQUIPO;
}

export function buscarEnCatalogo({ texto, categoria, catalogo, alias, usos, ahora = Date.now(), limite = 50 }: {
  texto: string; categoria?: string | null; catalogo: Material[];
  alias: Map<string, string>; usos: Map<string, Uso>; ahora?: number; limite?: number;
}): Material[] {
  const t = normMaterial(texto);
  const base = categoria ? catalogo.filter((m) => m.clasificacion === categoria) : catalogo;
  const porCodigo = new Map(catalogo.map((m) => [m.codigo.toLowerCase(), m]));

  let candidatos: Material[];
  if (!t) {
    candidatos = base.filter((m) => usos.has(m.codigo.toLowerCase()));
  } else {
    const palabras = t.split(" ");
    const extra = new Set<string>();
    const a = alias.get(t);
    if (a) extra.add(a.toLowerCase());
    for (const c of codigosDeTexto(t, (c) => porCodigo.get(c.toLowerCase())?.codigo) ?? []) extra.add(c.toLowerCase());
    candidatos = base.filter((m) => {
      const cod = m.codigo.toLowerCase();
      if (cod.includes(t) || extra.has(cod)) return true;
      // Cada palabra en cualquier parte: "itm 10" tiene que encontrar "1x10a".
      const donde = `${normMaterial(m.descripcion)} ${cod}`;
      return palabras.every((p) => donde.includes(p));
    });
  }

  return candidatos
    .map((m) => ({ m, exacto: m.codigo.toLowerCase() === t, p: puntaje(usos.get(m.codigo.toLowerCase()), ahora) }))
    .sort((x, y) => Number(y.exacto) - Number(x.exacto) || y.p - x.p || x.m.codigo.localeCompare(y.m.codigo))
    .slice(0, limite)
    .map((x) => x.m);
}
