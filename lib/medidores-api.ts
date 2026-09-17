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
  /**
   * Cada cuántas unidades acumuladas se abre una OT preventiva.
   *
   * Es la otra forma de disparar, y la que le da sentido al medidor manual: el
   * umbral `critico` vigila una magnitud instantánea (vibró 9 mm/s), esto cuenta
   * uso (cada 250 horas toca servicio). Ver el trigger en
   * 20260913120000_medidores_lectura_manual.sql.
   */
  intervalo_ot: number | null;
  /** Valor del contador en el que se disparó la última OT por intervalo. */
  ultimo_disparo_ot: number | null;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
}

export interface Lectura {
  id: string;
  medidor_id: string;
  valor: number;
  ts: string;
  /** Foto del instrumento que respalda el número. Solo en las manuales. */
  foto_url: string | null;
  /** `null` = entró por la API; con valor = la cargó esa persona. */
  creado_por: string | null;
  /**
   * Respuesta de paso que originó esta lectura, si vino de un procedimiento.
   *
   * `null` = se cargó a mano o la publicó un equipo. La copia la hace el trigger
   * `fn_paso_respuesta_a_lectura`, no el cliente: hay dos apps escribiendo esa
   * tabla y la móvil además encola offline.
   */
  paso_respuesta_id: string | null;
  created_at: string;
}

/** De dónde vino una lectura. Es lo que distingue las tres vías de entrada. */
export type OrigenLectura = "manual" | "procedimiento" | "api";

export function origenDeLectura(l: Pick<Lectura, "creado_por" | "paso_respuesta_id">): OrigenLectura {
  if (l.paso_respuesta_id) return "procedimiento";
  return l.creado_por ? "manual" : "api";
}

/** Medidor con su última lectura ya resuelta, que es lo que muestra el panel. */
export interface MedidorConUltima extends Medidor {
  ultima: Lectura | null;
  /** Nombre del activo al que cuelga. `null` si no tiene. */
  activo_nombre?: string | null;
  /** Nombre de su ubicación. `null` si no tiene. */
  ubicacion_nombre?: string | null;
}

const MEDIDOR_SELECT = `
  id, workspace_id, nombre, descripcion, tipo, unidad, activo_id, ubicacion_id,
  token, advertencia, critico, frecuencia_dias, intervalo_ot, ultimo_disparo_ot,
  activo, creado_por, created_at
`;

/**
 * El mismo select, más los nombres de activo y ubicación.
 *
 * Embebidos y no en dos consultas aparte: la tarjeta de la lista los muestra en
 * cada fila, y resolverlos después obligaría a un segundo viaje por pantalla.
 */
const MEDIDOR_SELECT_CON_NOMBRES = `
  ${MEDIDOR_SELECT},
  activos ( nombre ),
  ubicaciones ( edificio, detalle )
`;

/** Fila cruda de PostgREST, con las relaciones embebidas. */
type MedidorFila = Medidor & {
  activos: { nombre: string } | null;
  ubicaciones: { edificio: string | null; detalle: string | null } | null;
};

/**
 * Aplana las relaciones embebidas a dos campos planos.
 *
 * `ubicaciones` no tiene columna `nombre`: se rotula "edificio · detalle", igual
 * que en las OT (ver `exportar-mantto.js`). Mantener el mismo formato evita que
 * la misma ubicación se lea distinto según la pantalla.
 */
function aplanarNombres(f: MedidorFila): Medidor & { activo_nombre: string | null; ubicacion_nombre: string | null } {
  const { activos, ubicaciones, ...resto } = f;
  const ubic = ubicaciones
    ? [ubicaciones.edificio, ubicaciones.detalle].filter(Boolean).join(" · ") || null
    : null;

  return {
    ...resto,
    activo_nombre: activos?.nombre ?? null,
    ubicacion_nombre: ubic,
  };
}

const LECTURA_SELECT =
  "id, medidor_id, valor, ts, foto_url, creado_por, paso_respuesta_id, created_at";

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
  // activo con seis medidores no debería costar siete viajes.
  return conUltimaLectura(sb, medidores);
}

/** La serie de un medidor dentro de una ventana, para el gráfico. */
export async function fetchLecturas(medidorId: string, desde: Date, hasta: Date): Promise<Lectura[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("medidor_lecturas")
    .select(LECTURA_SELECT)
    .eq("medidor_id", medidorId)
    .gte("ts", desde.toISOString())
    .lte("ts", hasta.toISOString())
    .order("ts", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Lectura[];
}

/** Una página del historial, más el cursor para pedir la siguiente. */
export interface PaginaLecturas {
  lecturas: Lectura[];
  /** `ts` desde el cual seguir. `null` cuando ya no queda nada. */
  cursor: string | null;
}

/**
 * Página del historial, de la más nueva hacia atrás.
 *
 * Paginación por cursor (`ts < cursor`) y no por `range()`: el offset se
 * desalinea si entra una lectura mientras el usuario baja —y en un medidor
 * automatizado entran todo el tiempo—, con el resultado de que una fila se
 * repite o se salta al cambiar de página. El cursor apunta a un instante, así
 * que lo que llega nuevo aparece arriba y no descoloca lo que ya se leyó.
 *
 * Se pide una fila de más que `limite` para saber si hay siguiente página sin
 * gastar un COUNT aparte.
 *
 * ponytail: el cursor es solo `ts`, así que dos lecturas con el MISMO instante
 * exacto justo en el corte de página se pierden (`ts <` las excluye a las dos).
 * Hoy no existe ningún `ts` repetido en la tabla —verificado— y las lecturas
 * manuales no pueden colisionar al segundo; el caso aparecería si un gateway
 * publicara un lote con timestamps idénticos. Si pasa, el upgrade es un cursor
 * compuesto `(ts, id)` con `.or("ts.lt.X,and(ts.eq.X,id.lt.Y)")`.
 */
export async function fetchLecturasPagina(
  medidorId: string,
  limite = 20,
  cursor?: string | null,
): Promise<PaginaLecturas> {
  const sb = createClient();
  let q = sb
    .from("medidor_lecturas")
    .select(LECTURA_SELECT)
    .eq("medidor_id", medidorId)
    .order("ts", { ascending: false })
    .limit(limite + 1);

  if (cursor) q = q.lt("ts", cursor);

  const { data, error } = await q;
  if (error) throw error;

  const filas = (data ?? []) as unknown as Lectura[];
  const hayMas = filas.length > limite;
  const lecturas = hayMas ? filas.slice(0, limite) : filas;

  return {
    lecturas,
    cursor: hayMas ? lecturas[lecturas.length - 1].ts : null,
  };
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
  intervaloOt?: number | null;
  /**
   * Lectura actual del contador al dar de alta el medidor.
   *
   * Ancla la cuenta del intervalo: sin esto, un horómetro que ya marca 1.240 h
   * dispararía la OT en la primera lectura (porque arrancaría desde 0). Es el
   * "¿en cuánto va hoy?" que se pregunta al configurar.
   */
  lecturaInicial?: number | null;
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
      intervalo_ot: input.intervaloOt ?? null,
      // El ancla se guarda aunque no haya intervalo todavía: si mañana se
      // configura uno, la cuenta parte desde donde iba el contador y no desde 0.
      ultimo_disparo_ot: input.lecturaInicial ?? null,
      creado_por: auth.user?.id ?? null,
    })
    .select(MEDIDOR_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Medidor;
}

/** Ajustes editables de un medidor ya creado. */
export async function updateMedidor(
  medidorId: string,
  cambios: Partial<Pick<Medidor,
    "nombre" | "descripcion" | "advertencia" | "critico" |
    "frecuencia_dias" | "intervalo_ot" | "ultimo_disparo_ot" |
    // Activo y ubicación sí se editan: un medidor se puede remontar o pasar a
    // otra máquina, y el trigger copia ambos a la OT que genera.
    "activo_id" | "ubicacion_id">>,
): Promise<Medidor> {
  const sb = createClient();
  const { data, error } = await sb
    .from("medidores")
    .update(cambios)
    .eq("id", medidorId)
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
  fotoUrl?: string | null;
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
      foto_url: input.fotoUrl ?? null,
      creado_por: auth.user?.id ?? null,
    })
    .select(LECTURA_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Lectura;
}

/**
 * Si este valor completa el intervalo de mantenimiento por uso.
 *
 * Espejo exacto del trigger: `valor - COALESCE(ultimo_disparo_ot, 0) >= intervalo_ot`.
 * Sin ancla cuenta desde 0, así que un horómetro que ya venía corriendo dispara
 * en su primera lectura — que es lo correcto: esa máquina ya se pasó del
 * mantenimiento. Si esto y el trigger divergen, el aviso de la UI miente.
 */
export function cumpleIntervalo(
  valor: number,
  medidor: Pick<Medidor, "intervalo_ot" | "ultimo_disparo_ot">,
): boolean {
  if (medidor.intervalo_ot == null) return false;
  return valor - (medidor.ultimo_disparo_ot ?? 0) >= medidor.intervalo_ot;
}

/** Cuánto uso falta para el próximo mantenimiento. `null` si no hay intervalo. */
export function faltaParaIntervalo(
  valor: number,
  medidor: Pick<Medidor, "intervalo_ot" | "ultimo_disparo_ot">,
): number | null {
  if (medidor.intervalo_ot == null) return null;
  // Se redondea a dos decimales: es texto para una persona, no un cálculo.
  return Math.round((medidor.intervalo_ot - (valor - (medidor.ultimo_disparo_ot ?? 0))) * 100) / 100;
}

/**
 * Cuándo le toca la próxima lectura a un medidor manual.
 *
 * `null` cuando no hay ronda definida (`frecuencia_dias` NULL) o cuando el
 * medidor es automatizado — su gateway no espera que nadie vaya a leerlo.
 *
 * Sin lecturas todavía, la ronda vence YA: el medidor se creó para leerse, y
 * dejarlo fuera de la lista de pendientes lo esconde justo cuando hace falta
 * que aparezca.
 */
export function proximaLectura(medidor: MedidorConUltima): Date | null {
  if (medidor.tipo !== "manual" || medidor.frecuencia_dias == null) return null;
  if (!medidor.ultima) return new Date(0);
  return new Date(new Date(medidor.ultima.ts).getTime() + medidor.frecuencia_dias * 86_400_000);
}

/** Un medidor manual cuya ronda ya venció. */
export function lecturaVencida(medidor: MedidorConUltima, ahora = Date.now()): boolean {
  const prox = proximaLectura(medidor);
  return prox !== null && prox.getTime() <= ahora;
}

/**
 * Todos los medidores vigentes del workspace, con su última lectura.
 *
 * Es lo que alimenta la lista de medidores de la app móvil (y la ronda de
 * lecturas pendientes). Comparte el agrupado de últimas lecturas con
 * `fetchMedidoresDeActivo`.
 */
export async function fetchMedidores(workspaceId: string): Promise<MedidorConUltima[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("medidores")
    .select(MEDIDOR_SELECT_CON_NOMBRES)
    .eq("workspace_id", workspaceId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) throw error;
  // La tarjeta de la lista muestra activo y ubicación, así que acá sí se traen
  // los nombres (en la ficha de un activo no hacen falta: ya se sabe cuál es).
  const medidores = ((data ?? []) as unknown as MedidorFila[]).map(aplanarNombres);
  if (medidores.length === 0) return [];

  return conUltimaLectura(sb, medidores);
}

/**
 * Pega la última lectura de cada medidor en una sola consulta.
 *
 * ponytail: trae las últimas N por el índice (medidor_id, ts DESC) y agrupa acá,
 * en vez de un DISTINCT ON. Con decenas de medidores alcanza; si un workspace
 * llega a cientos, esto pasa a una vista.
 */
async function conUltimaLectura<T extends Medidor>(
  sb: ReturnType<typeof createClient>,
  medidores: T[],
): Promise<(T & { ultima: Lectura | null })[]> {
  const { data: lecturas, error } = await sb
    .from("medidor_lecturas")
    .select(LECTURA_SELECT)
    .in("medidor_id", medidores.map(m => m.id))
    .order("ts", { ascending: false })
    .limit(medidores.length * 20);

  if (error) throw error;

  const ultimaPorMedidor = new Map<string, Lectura>();
  for (const l of (lecturas ?? []) as unknown as Lectura[]) {
    if (!ultimaPorMedidor.has(l.medidor_id)) ultimaPorMedidor.set(l.medidor_id, l);
  }

  return medidores.map(m => ({ ...m, ultima: ultimaPorMedidor.get(m.id) ?? null }));
}

/**
 * Borra una lectura.
 *
 * La tabla no tiene policy de UPDATE a propósito —una lectura es un hecho
 * medido, no un campo— así que "editar" en la UI es borrar y volver a cargar.
 *
 * Una lectura que vino de un procedimiento se puede borrar de la serie, pero la
 * respuesta del paso queda: es la evidencia de lo que contestó el técnico y no
 * le corresponde a esta pantalla tocarla.
 */
export async function deleteLectura(lecturaId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("medidor_lecturas").delete().eq("id", lecturaId);
  if (error) throw error;
}

/** Nombre de quien cargó cada lectura, para el historial. */
export async function fetchAutores(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();

  const sb = createClient();
  const { data, error } = await sb.from("usuarios").select("id, nombre").in("id", unicos);
  if (error) throw error;

  return new Map((data ?? []).map(u => [u.id as string, (u.nombre as string) ?? "—"]));
}

/**
 * Procedimiento de un solo paso que toma la lectura de este medidor.
 *
 * Es lo que convierte "quiero que alguien vaya a leer el horómetro" en trabajo
 * asignable: una OT con este procedimiento adjunto le pone al técnico el campo
 * de la lectura, y al responderlo el número entra a la serie del medidor solo
 * —eso ya lo hace el trigger `fn_paso_respuesta_a_lectura`, por el `medidor_id`
 * del paso. Acá no se copia ningún número a mano.
 *
 * GET-OR-CREATE y no create: el botón se aprieta todos los meses. Creando uno
 * nuevo cada vez, el catálogo de /procedimientos termina con doce "Lectura de
 * Medidor Corriente de Motor" y el historial del medidor queda repartido entre
 * todos. Se busca por `medidor_id` del paso y no por el nombre, porque al
 * medidor se le puede cambiar el nombre y el procedimiento tiene que seguir
 * siendo el mismo.
 */
export async function procedimientoDeMedidor(medidor: Pick<Medidor, "id" | "nombre" | "unidad" | "workspace_id">): Promise<string> {
  const sb = createClient();

  const { data: existente, error: buscarErr } = await sb
    .from("procedimiento_pasos")
    .select("procedimiento_id, procedimientos!procedimiento_pasos_procedimiento_id_fkey(id, activo)")
    .eq("medidor_id", medidor.id)
    .limit(20);
  if (buscarErr) throw buscarErr;

  const vigente = (existente ?? []).find((p: any) => p.procedimientos?.activo);
  if (vigente) return vigente.procedimiento_id as string;

  const { data: auth } = await sb.auth.getUser();

  const { data: proc, error: procErr } = await sb
    .from("procedimientos")
    .insert({
      workspace_id: medidor.workspace_id,
      nombre: `Lectura de Medidor ${medidor.nombre}`,
      categoria: "Medidores",
      // Bloquea el cierre: una OT de lectura sin la lectura tomada no cumplió
      // su único propósito, y cerrarla igual deja el hoyo en la serie que esta
      // función existe para evitar.
      bloquea_cierre_ot: true,
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();
  if (procErr) throw procErr;

  const { error: pasoErr } = await sb.from("procedimiento_pasos").insert({
    procedimiento_id: proc.id,
    orden: 1,
    tipo: "medidor",
    titulo: medidor.nombre,
    unidad: medidor.unidad,
    requerido: true,
    // El vínculo real de la función: sin esto el paso guarda un número suelto
    // en `paso_respuestas` y nunca llega a la serie del medidor.
    medidor_id: medidor.id,
  });
  if (pasoErr) throw pasoErr;

  return proc.id as string;
}

/** Baja lógica: borrar de verdad se llevaría el historial de lecturas. */
export async function deleteMedidor(medidorId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("medidores").update({ activo: false }).eq("id", medidorId);
  if (error) throw error;
}
