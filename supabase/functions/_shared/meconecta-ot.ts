// Crea la OT de Electrilam a partir del detalle de una solicitud MeConecta.
//
// Sin IA: el portal ya entrega cada dato con su etiqueta (meconecta-scrape.ts),
// y el calce con el catálogo es por texto normalizado. Lo que no calza queda a
// la vista (ubicacion_texto / lugar en texto / sin ITO) para que un admin lo
// complete, en vez de quedar mal asignado.
//
// Reglas sacadas de cómo Electrilam llenaba estas OTs a mano (232 OTs SF,
// sep–nov 2026): reactiva, categoría Eléctrico, plazo 7 días, sin asignar.
//
// resolverOt() solo lee; crearOtDesdeSolicitud() escribe. La previsualización
// del cron usa la primera, así la prueba corre exactamente la misma lógica.

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { descargarArchivo, descargarPdfSolicitud, type SolicitudDetalle } from "./meconecta-scrape.ts";
import { ELECTRILAM_WS } from "./meconecta-conexion.ts";
import { subirR2 } from "./r2.ts";
import { descripcionDe, matchCategoria, matchIto, norm, prioridadDe, sumarDias } from "./meconecta-reglas.ts";

type Supabase = ReturnType<typeof createClient>;

const PLAZO_DIAS = 7;
const IMAGEN_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const ARCHIVO_EXT: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

function extension(url: string): string {
  return (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)?.[1] ?? "").toLowerCase();
}

/** Tipo MIME del adjunto y si va a fotos de referencia; null = no soportado. */
export function tipoAdjunto(url: string): { ext: string; mime: string; imagen: boolean } | null {
  const ext = extension(url);
  if (IMAGEN_EXT[ext]) return { ext, mime: IMAGEN_EXT[ext], imagen: true };
  if (ARCHIVO_EXT[ext]) return { ext, mime: ARCHIVO_EXT[ext], imagen: false };
  return null;
}

export interface OtResuelta {
  /** Fila lista para insertar en ordenes_trabajo (lugar_id null si el lugar es nuevo). */
  fila: Record<string, unknown>;
  /** Lugar a crear bajo la ubicación antes del insert, si no existía. */
  lugarNuevo: { nombre: string; ubicacion_id: string } | null;
  pendientes: string[];
}

/** Arma la OT sin escribir nada. */
export async function resolverOt(supabase: Supabase, d: SolicitudDetalle, fecha: string): Promise<OtResuelta> {
  const ws = ELECTRILAM_WS;
  const [ubics, hitos, socs, cats, wsFlags] = await Promise.all([
    supabase.from("ubicaciones").select("id, edificio").eq("workspace_id", ws).eq("activa", true),
    supabase.from("hitos").select("nombre").eq("workspace_id", ws).eq("archivada", false),
    supabase.from("sociedades").select("id, nombre").eq("workspace_id", ws),
    supabase.from("categorias_ot").select("id, nombre").or(`workspace_id.is.null,workspace_id.eq.${ws}`).eq("archivada", false),
    supabase.from("workspaces")
      .select("requiere_materiales_global, requiere_hoja_global, requiere_fotos_global, fotos_obligatorias_todas")
      .eq("id", ws).maybeSingle(),
  ]);
  for (const r of [ubics, hitos, socs, cats, wsFlags]) if (r.error) throw new Error(`catálogo: ${r.error.message}`);

  // El catálogo tiene edificios duplicados (nov 2026: 5, p. ej. Humanidades ×4).
  // Entre iguales gana la ubicación con más OTs: la que la gente elige.
  const candidatas = ((ubics.data ?? []) as { id: string; edificio: string }[])
    .filter((u) => norm(d.ubicacion) !== "" && norm(u.edificio) === norm(d.ubicacion));
  let ubicacion = candidatas[0] ?? null;
  if (candidatas.length > 1) {
    const usos = await Promise.all(candidatas.map((u) => supabase.from("ordenes_trabajo")
      .select("id", { count: "exact", head: true }).eq("ubicacion_id", u.id).then((r: { count: number | null }) => r.count ?? 0)));
    ubicacion = candidatas[usos.indexOf(Math.max(...usos))];
  }
  const ito = matchIto(d.resolutor, ((hitos.data ?? []) as { nombre: string }[]).map((h) => h.nombre));
  const socsIguales = ((socs.data ?? []) as { id: string; nombre: string }[]).filter((s) => norm(s.nombre) === norm(d.sociedad));
  const sociedadId = socsIguales.length === 1 ? socsIguales[0].id : null;
  const categoriaId = matchCategoria(d.tipoMantencion, (cats.data ?? []) as { id: string; nombre: string }[]);

  // Lugar: se busca bajo la ubicación; si no existe se creará (como hace el
  // formulario). Primer calce aunque haya duplicados: crear otro empeoraría el
  // catálogo. Sin ubicación no se crea un lugar huérfano: queda como texto.
  let lugarId: string | null = null;
  let lugarNuevo: OtResuelta["lugarNuevo"] = null;
  if (ubicacion && d.lugar) {
    const { data: lugares } = await supabase.from("lugares").select("id, nombre")
      .eq("workspace_id", ws).eq("ubicacion_id", ubicacion.id);
    lugarId = ((lugares ?? []) as { id: string; nombre: string }[]).find((l) => norm(l.nombre) === norm(d.lugar))?.id ?? null;
    if (!lugarId) lugarNuevo = { nombre: d.lugar, ubicacion_id: ubicacion.id };
  }

  const f = wsFlags.data as Record<string, boolean | null> | null;
  const fila = {
    workspace_id: ws,
    creado_por: null, // la creó Pangui, no una persona
    origen: "meconecta",
    titulo: d.titulo || `Solicitud ${d.folio}`,
    descripcion: descripcionDe(d, ito),
    n_serie: d.folio,
    solicitante: d.contacto || null,
    solicitante_telefono: d.telefono || null,
    solicitante_email: d.email || null,
    hito: ito,
    tipo: "solicitud",
    tipo_trabajo: "reactiva",
    clasificacion: "ejecucion",
    estado: "pendiente",
    prioridad: prioridadDe(d.prioridad),
    recurrencia: "ninguna",
    estado_cobro: "no_cobrable",
    requiere_materiales: f?.requiere_materiales_global ?? false,
    requiere_hoja: f?.requiere_hoja_global ?? false,
    requiere_fotos: (f?.fotos_obligatorias_todas ?? false) || (f?.requiere_fotos_global ?? false),
    categoria_id: categoriaId,
    categoria_ids: categoriaId ? [categoriaId] : null,
    ubicacion_id: ubicacion?.id ?? null,
    ubicacion_texto: ubicacion ? null : d.ubicacion || null,
    lugar_id: lugarId,
    lugar: ubicacion ? null : d.lugar || null,
    sociedad_id: sociedadId,
    fecha_inicio: fecha,
    fecha_termino: sumarDias(fecha, PLAZO_DIAS),
    links: [],
  };

  const pendientes = [
    !ito && "sin ITO",
    !ubicacion && d.ubicacion && "ubicación nueva",
  ].filter((p): p is string => Boolean(p));
  return { fila, lugarNuevo, pendientes };
}

export interface OtCreada {
  id: string;
  numero: number | null;
  /** true si ya existía una OT con ese folio (no se creó nada). */
  existente: boolean;
  /** Lo que un admin debe completar a mano ("sin ITO", …), para el aviso. */
  pendientes: string[];
}

/** PDF "Solicitud de Mantención" del portal, con el nombre que usaba Electrilam a mano. */
async function copiarPdfSolicitud(cookie: string, idExterno: number, folio: string, carpeta: string) {
  const bytes = await descargarPdfSolicitud(cookie, idExterno);
  const url = await subirR2(`${carpeta}/${Date.now()}_${crypto.randomUUID().slice(0, 12)}.pdf`, bytes, "application/pdf");
  return { url, nombre: `Solicitud_${folio}.pdf`, tipo: "archivo" as const, origen: "creacion" as const, bytes: bytes.byteLength };
}

/**
 * @param fecha "YYYY-MM-DD" de la solicitud (de la tabla "asignadas").
 * @param idExterno id interno del portal (para bajar el PDF de la solicitud).
 */
export async function crearOtDesdeSolicitud(
  supabase: Supabase,
  cookie: string,
  d: SolicitudDetalle,
  fecha: string,
  idExterno: number,
): Promise<OtCreada> {
  const ws = ELECTRILAM_WS;

  // Folio ya cargado (a mano o por una corrida anterior): no se duplica.
  const { data: previa } = await supabase.from("ordenes_trabajo")
    .select("id, numero").eq("workspace_id", ws).ilike("n_serie", d.folio).is("deleted_at", null).limit(1).maybeSingle();
  if (previa) return { id: previa.id as string, numero: previa.numero as number, existente: true, pendientes: [] };

  const { fila, lugarNuevo, pendientes } = await resolverOt(supabase, d, fecha);

  if (lugarNuevo) {
    const { data: nuevo, error } = await supabase.from("lugares")
      .insert({ workspace_id: ws, ...lugarNuevo, activo: true }).select("id").single();
    if (error) throw new Error(`lugar: ${error.message}`);
    fila.lugar_id = nuevo.id;
  }

  // Catálogo de solicitantes (autocompletado del formulario). Best-effort: la
  // OT guarda su propia copia del contacto.
  if (d.contacto) {
    const { data: s } = await supabase.from("solicitantes").select("id")
      .eq("workspace_id", ws).ilike("nombre", d.contacto).limit(1).maybeSingle();
    const contacto = { telefono: d.telefono || null, email: d.email || null };
    await (s
      ? supabase.from("solicitantes").update(contacto).eq("id", s.id)
      : supabase.from("solicitantes").insert({ workspace_id: ws, nombre: d.contacto, ...contacto }));
  }

  const { data: ot, error } = await supabase.from("ordenes_trabajo").insert(fila).select("id, numero").single();
  if (error) throw new Error(`OT: ${error.message}`);
  const otId = ot.id as string;

  // Adjuntos del portal: imágenes al grupo de fotos de referencia, el resto a
  // los adjuntos de la OT. Un adjunto que falla no tumba la OT ya creada: se
  // cuenta y se avisa en la notificación.
  let archivosFallidos = 0;
  let grupoId: string | null = null;
  const links: { url: string; nombre: string; tipo: "archivo"; origen: "creacion" }[] = [];
  // El PDF de la solicitud va primero, y queda registrado en ot_impresiones:
  // eso es lo que hace aparecer el botón de imprimir en la card.
  try {
    const { bytes: _b, ...pdf } = await copiarPdfSolicitud(cookie, idExterno, d.folio, `ordenes/${otId}/adjuntos`);
    links.push(pdf);
    const { error: impErr } = await supabase.from("ot_impresiones").insert({ orden_id: otId, workspace_id: ws, pdf_url: pdf.url });
    if (impErr) console.error(`[meconecta-ot] ${d.folio} ot_impresiones:`, impErr.message);
  } catch (e) {
    pendientes.push("sin PDF de la solicitud");
    console.error(`[meconecta-ot] ${d.folio} PDF:`, e);
  }
  for (const [i, url] of d.archivos.entries()) {
    try {
      const tipo = tipoAdjunto(url);
      if (!tipo) throw new Error("extensión no soportada");
      const bytes = await descargarArchivo(cookie, url);
      const objeto = `${Date.now()}_${crypto.randomUUID().slice(0, 12)}.${tipo.ext}`;
      if (tipo.imagen) {
        if (!grupoId) {
          const { data: g, error: gErr } = await supabase.from("foto_grupos").insert({
            orden_id: otId, workspace_id: ws, titulo: "Fotos MeConecta", tipo: "referencia", orden_display: 0,
          }).select("id").single();
          if (gErr) throw new Error(`grupo: ${gErr.message}`);
          grupoId = g.id as string;
        }
        const publica = await subirR2(`ordenes/${otId}/grupos/${grupoId}/${objeto}`, bytes, tipo.mime);
        const { error: iErr } = await supabase.from("foto_grupo_items").insert({ grupo_id: grupoId, url: publica, orden_display: i });
        if (iErr) throw new Error(`foto: ${iErr.message}`);
      } else {
        const publica = await subirR2(`ordenes/${otId}/adjuntos/${objeto}`, bytes, tipo.mime);
        links.push({ url: publica, nombre: decodeURIComponent(url.split("/").pop() ?? `Archivo ${i + 1}`), tipo: "archivo", origen: "creacion" });
      }
    } catch (e) {
      archivosFallidos += 1;
      console.error(`[meconecta-ot] ${d.folio} adjunto ${url}:`, e);
    }
  }
  if (links.length > 0) {
    const { error: lErr } = await supabase.from("ordenes_trabajo").update({ links }).eq("id", otId);
    if (lErr) { archivosFallidos += links.length; console.error(`[meconecta-ot] ${d.folio} links:`, lErr.message); }
  }

  if (archivosFallidos > 0) pendientes.push(`${archivosFallidos} adjunto(s) sin copiar`);
  return { id: otId, numero: ot.numero as number, existente: false, pendientes };
}

/**
 * Prueba sin tocar la base: arma la OT y copia los adjuntos a pruebas/ en R2
 * (verifica descarga del portal + subida), devolviendo lo que se habría creado.
 */
export async function previsualizarOt(supabase: Supabase, cookie: string, d: SolicitudDetalle, fecha: string, idExterno: number) {
  const resuelta = await resolverOt(supabase, d, fecha);
  const adjuntos: Record<string, unknown>[] = [];
  try {
    adjuntos.push({ ...(await copiarPdfSolicitud(cookie, idExterno, d.folio, "pruebas/meconecta")), destino: "adjuntos (PDF solicitud)" });
  } catch (e) {
    adjuntos.push({ pdfSolicitud: true, error: e instanceof Error ? e.message : String(e) });
  }
  for (const url of d.archivos) {
    try {
      const tipo = tipoAdjunto(url);
      if (!tipo) throw new Error("extensión no soportada");
      const bytes = await descargarArchivo(cookie, url);
      const copia = await subirR2(`pruebas/meconecta/${d.folio}_${Date.now()}.${tipo.ext}`, bytes, tipo.mime);
      adjuntos.push({ url, destino: tipo.imagen ? "fotos de referencia" : "adjuntos", bytes: bytes.byteLength, copia });
    } catch (e) {
      adjuntos.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { detalle: d, ...resuelta, adjuntos };
}
