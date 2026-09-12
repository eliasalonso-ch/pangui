/**
 * Medidores y sus lecturas.
 *
 * Un medidor es un punto de lectura sobre un activo: vibración, corriente,
 * temperatura, horas de funcionamiento. Puede cargarlo una persona en la ronda
 * (`manual`) o un dispositivo contra la API (`automatizado`); para todo lo que
 * viene después —el gráfico, el umbral, la OT que se abre sola— da lo mismo de
 * dónde vino el número.
 *
 * El disparo de la OT NO está acá: vive en el trigger
 * `fn_medidor_lectura_critica`, para que una lectura manual dispare igual que
 * una automatizada. Ver 20260911200000_medidores.sql.
 */

import { createClient } from "@/lib/supabase";

export type TipoMedidor = "manual" | "automatizado";

/** Cómo se lee una lectura contra los umbrales del medidor. */
export type NivelLectura = "normal" | "advertencia" | "critico";

export interface Medidor {
  id: string;
  workspace_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoMedidor;
  unidad: string;
  activo_id: string | null;
  ubicacion_id: string | null;
  /** Solo en los automatizados. Es la credencial que pega el cliente en su gateway. */
  token: string | null;
  advertencia: number | null;
  critico: number | null;
  /** Cada cuántos días toca leerlo. Solo en los manuales; `null` = sin ronda. */
  frecuencia_dias: number | null;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
}

export interface Lectura {
  id: string;
  medidor_id: string;
  valor: number;
  ts: string;
  /** `null` = entró por la API; con valor = la cargó esa persona. */
  creado_por: string | null;
  created_at: string;
}

/** Medidor con su última lectura ya resuelta, que es lo que muestra el panel. */
export interface MedidorConUltima extends Medidor {
  ultima: Lectura | null;
}

const MEDIDOR_SELECT = `
  id, workspace_id, nombre, descripcion, tipo, unidad, activo_id, ubicacion_id,
  token, advertencia, critico, frecuencia_dias, activo, creado_por, created_at
`;

/**
 * En qué franja cae un valor.
 *
 * Sin umbrales configurados todo es `normal`: el medidor solo grafica. Y el
 * orden importa —crítico primero— porque un valor que pasa el crítico también
 * pasa la advertencia.
 */
export function nivelDeLectura(valor: number, medidor: Pick<Medidor, "advertencia" | "critico">): NivelLectura {
  if (medidor.critico != null && valor >= medidor.critico) return "critico";
  if (medidor.advertencia != null && valor >= medidor.advertencia) return "advertencia";
  return "normal";
}

/** Los medidores vigentes de un activo, con su última lectura. */
export async function fetchMedidoresDeActivo(activoId: string): Promise<MedidorConUltima[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("medidores")
    .select(MEDIDOR_SELECT)
    .eq("activo_id", activoId)
    .eq("activo", true)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const medidores = (data ?? []) as unknown as Medidor[];
  if (medidores.length === 0) return [];

  // Una consulta para todas las últimas lecturas en vez de una por medidor: un
  // activo con seis medidores no debería costar siete viajes. Se traen las
  // últimas N por el índice (medidor_id, ts DESC) y se agrupa acá.
  //
  // ponytail: el límite es un múltiplo del número de medidores, no un
  // DISTINCT ON por medidor. Con pocos medidores por activo alcanza de sobra;
  // si alguno llega a tener decenas, esto pasa a una vista con DISTINCT ON.
  const { data: lecturas, error: errLecturas } = await sb
    .from("medidor_lecturas")
    .select("id, medidor_id, valor, ts, creado_por, created_at")
    .in("medidor_id", medidores.map(m => m.id))
    .order("ts", { ascending: false })
    .limit(medidores.length * 20);

  if (errLecturas) throw errLecturas;

  const ultimaPorMedidor = new Map<string, Lectura>();
  for (const l of (lecturas ?? []) as unknown as Lectura[]) {
    // Vienen ordenadas desc, así que la primera de cada medidor es la última.
    if (!ultimaPorMedidor.has(l.medidor_id)) ultimaPorMedidor.set(l.medidor_id, l);
  }

  return medidores.map(m => ({ ...m, ultima: ultimaPorMedidor.get(m.id) ?? null }));
}

/** La serie de un medidor dentro de una ventana, para el gráfico. */
export async function fetchLecturas(medidorId: string, desde: Date, hasta: Date): Promise<Lectura[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("medidor_lecturas")
    .select("id, medidor_id, valor, ts, creado_por, created_at")
    .eq("medidor_id", medidorId)
    .gte("ts", desde.toISOString())
    .lte("ts", hasta.toISOString())
    .order("ts", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Lectura[];
}

/**
 * Token de un medidor automatizado.
 *
 * `pang_mtr_` como prefijo para que se reconozca de un vistazo en la config de
 * un gateway ajeno, y para poder buscarlo si alguna vez se filtra en un log.
 * `crypto.randomUUID` en vez de Math.random porque esto es una credencial.
 */
function nuevoToken(): string {
  return `pang_mtr_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function createMedidor(input: {
  workspaceId: string;
  nombre: string;
  tipo: TipoMedidor;
  unidad: string;
  descripcion?: string | null;
  activoId?: string | null;
  ubicacionId?: string | null;
  advertencia?: number | null;
  critico?: number | null;
  frecuenciaDias?: number | null;
}): Promise<Medidor> {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("medidores")
    .insert({
      workspace_id: input.workspaceId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      tipo: input.tipo,
      unidad: input.unidad.trim(),
      activo_id: input.activoId || null,
      ubicacion_id: input.ubicacionId || null,
      // La constraint `medidores_token_por_tipo` exige exactamente esto.
      token: input.tipo === "automatizado" ? nuevoToken() : null,
      advertencia: input.advertencia ?? null,
      critico: input.critico ?? null,
      // Un automatizado publica al ritmo de su gateway: la ronda no le aplica.
      frecuencia_dias: input.tipo === "manual" ? (input.frecuenciaDias ?? null) : null,
      creado_por: auth.user?.id ?? null,
    })
    .select(MEDIDOR_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Medidor;
}

/**
 * Carga una lectura a mano.
 *
 * `ts` opcional para poder fechar hacia atrás, por el mismo motivo que
 * `cambiar_estado_activo` acepta `p_desde`: nadie está frente al sistema en el
 * momento exacto en que se toma la medición en terreno.
 */
export async function registrarLectura(input: {
  medidorId: string;
  workspaceId: string;
  valor: number;
  ts?: Date;
}): Promise<Lectura> {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("medidor_lecturas")
    .insert({
      medidor_id: input.medidorId,
      workspace_id: input.workspaceId,
      valor: input.valor,
      ts: (input.ts ?? new Date()).toISOString(),
      creado_por: auth.user?.id ?? null,
    })
    .select("id, medidor_id, valor, ts, creado_por, created_at")
    .single();

  if (error) throw error;
  return data as unknown as Lectura;
}

/** Baja lógica: borrar de verdad se llevaría el historial de lecturas. */
export async function deleteMedidor(medidorId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("medidores").update({ activo: false }).eq("id", medidorId);
  if (error) throw error;
}
