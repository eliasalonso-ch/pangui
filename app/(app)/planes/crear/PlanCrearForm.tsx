"use client";

import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, ChevronUp, ChevronDown, Search, X, Loader2, Box,
  Plus, Pencil, User, Clock, Flag, Wrench, Tag,
  ClipboardCheck, Package, Paperclip,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { createPlan, updatePlan, getPlan, listPlanMateriales } from "@/lib/planes-api";
import { RECURRENCIA_PLAN_LABELS, type RecurrenciaPlan, type PlanForm } from "@/types/planes";
import type { RecurrenciaConfig, Usuario } from "@/types/ordenes";
import type { PlanMantencion } from "@/types/planes";
import { usePlanDraft, type PlantillaOT, type PlanDraft } from "./PlanDraftContext";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";

/**
 * Crear un plan de mantención.
 *
 * Tres secciones plegables —Activo, Programa, Detalles de la OT— porque son
 * tres decisiones distintas: QUÉ se mantiene, CUÁNDO, y CÓMO se ve la orden
 * que sale de ahí. Solo las dos primeras son obligatorias; la tercera son
 * valores por defecto que se heredan a cada OT generada.
 *
 * La distinción que más cuesta explicar, y por eso está en la UI y no solo en
 * el esquema: "vencimiento" (cuándo debe estar hecha), "apertura" (cuándo la OT
 * aparece para trabajarla) y "aviso" (cuándo se avisa para alcanzar a comprar
 * los insumos) son tres fechas distintas.
 */

type ActivoOpt = {
  id: string;
  nombre: string;
  imagen_url: string | null;
  estado: string | null;
};

// Mismos valores que la bandeja de activos (ActivosBandeja), para que un activo
// se lea igual aquí que en su propia pantalla.
const ESTADO_ACTIVO_LABEL: Record<string, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ESTADO_ACTIVO_COLOR: Record<string, string> = {
  operativo: "var(--success)",
  fuera_servicio: "var(--danger)",
  // Naranja pleno y no --warning: ese token es un ámbar oscuro pensado para
  // texto y como relleno de un punto se ve marrón.
  mantencion: "#F59E0B",
  baja: "var(--st-cancel-dot)",
};

const RECURRENCIAS = Object.entries(RECURRENCIA_PLAN_LABELS) as [RecurrenciaPlan, string][];

/** Activos por consulta en el selector: la lista visible muestra 8. */
const ACTIVOS_PAGE_SIZE = 20;

// Mismo vocabulario que el formulario de OT (OTCrearForm), para que la
// plantilla del plan ofrezca exactamente las mismas opciones que una OT manual.
const PRIORIDADES = [
  { value: "ninguna", label: "Sin prioridad", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",          activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",         activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",          activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente",       activeColor: "var(--danger)" },
];

/**
 * Un plan guardado, de vuelta a la forma que usa el formulario.
 *
 * La conversión no es simétrica con lo que se envía: la UI descompone lo que la
 * base guarda junto (recurrencia_config trae interval, weekdays y day_of_month
 * en un jsonb; el horizonte se guarda en días y aquí se reparte en número +
 * unidad), así que hay que deshacer esa mezcla campo por campo.
 */
function planADraft(p: PlanMantencion): PlanDraft {
  const cfg = p.recurrencia_config ?? {};
  const dias = p.horizonte_dias ?? 365;

  // Se elige la unidad más gruesa que divida exacto, que es como el usuario lo
  // escribió: 90 días vuelve a leerse "3 meses", no "90 días".
  const unidad: "dias" | "semanas" | "meses" =
    dias % 30 === 0 ? "meses" : dias % 7 === 0 ? "semanas" : "dias";
  const horizonteNum =
    unidad === "meses" ? dias / 30 : unidad === "semanas" ? dias / 7 : dias;

  const weekdays = Array.isArray(cfg.weekdays) ? cfg.weekdays : [];

  return {
    nombre: p.nombre ?? "",
    activoId: p.activo_id ?? null,
    recurrencia: p.recurrencia ?? "",
    intervalo: Math.max(1, Number(cfg.interval ?? 1)),
    // Diaria usa la lista completa; semanal solo el primero. Cuando el plan no
    // guardó weekdays (diaria "todos los días") se restauran los siete.
    diasSemana: p.recurrencia === "diaria" && weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6],
    diaSemanal: p.recurrencia === "semanal" && weekdays.length ? weekdays[0] : 1,
    diaDelMes: Number(cfg.day_of_month ?? 1),
    ordinalSemana: Number(cfg.week_ordinal ?? 1),
    diaOrdinal: p.recurrencia === "mensual_dia" && weekdays.length ? weekdays[0] : 1,
    fechaInicio: p.fecha_inicio ?? "",
    fechaFin: p.fecha_fin ?? "",
    // `time` de Postgres llega como "09:00:00"; el input type=time quiere "09:00".
    horaVencimiento: p.hora_vencimiento ? p.hora_vencimiento.slice(0, 5) : "",
    diasApertura: p.dias_apertura_previa ?? 1,
    diasAviso: p.dias_aviso_previo ?? 30,
    horizonteNum,
    horizonteUnidad: unidad,
  };
}

function planAPlantilla(p: PlanMantencion): PlantillaOT {
  const h = p.duracion_estimada_horas ?? null;
  const horas = h ? Math.floor(h) : 0;
  const mins = h ? Math.round((h - horas) * 60) : 0;

  return {
    titulo: p.titulo_ot ?? "",
    descripcion: p.descripcion_ot ?? "",
    categoria_id: p.categoria_id ?? "",
    prioridad: p.prioridad ?? "ninguna",
    asignados_ids: p.asignados_ids ?? [],
    tiempo_h: horas ? String(horas) : "",
    tiempo_m: mins ? String(mins) : "",
    procedimiento_ids: p.procedimiento_ids ?? [],
    adjuntos: p.adjuntos ?? [],
    // Los materiales viven en su propia tabla; el gate los carga aparte.
    materiales: [],
    proveedor_id: p.proveedor_id ?? "",
    // Un plan guardado siempre tiene plantilla, aunque sea la de por defecto:
    // el panel debe mostrarla resumida, no el botón de "añadir".
    definida: true,
  };
}

export default function PlanCrearForm() {
  const suscripcion = useSuscripcion();

  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.planes_mantencion) {
    return (
      <UpgradePrompt
        variant="card"
        title="Los planes de mantención están disponibles en Pro"
        description="Sube tu plan para programar mantenciones con meses de anticipación y prepararlas antes de que venzan."
        upgradeTo="Pro"
      />
    );
  }
  return <PlanCrearGate />;
}

/**
 * Precarga el plan cuando la URL trae `?editar=<id>`.
 *
 * Vive fuera del formulario porque el estado de los campos se siembra del
 * borrador en el `useState` inicial, o sea una sola vez: si el formulario ya
 * estuviera montado cuando llega el plan, no lo vería. Montarlo recién con el
 * borrador listo —y con un `key` que cambia— es lo que hace que los campos
 * aparezcan llenos.
 */
function PlanCrearGate() {
  const searchParams = useSearchParams();
  const { editandoId, cargarDesde } = usePlanDraft();
  const editarId = searchParams.get("editar");

  // Si ya se está editando ese id, el borrador está vivo (el usuario viene de
  // la plantilla) y volver a cargarlo pisaría sus cambios sin guardar.
  const yaCargado = !editarId || editandoId === editarId;

  // Arranca en false siempre: el servidor no ve el query param, así que sembrar
  // este estado con `yaCargado` daba un HTML distinto en servidor y cliente
  // (formulario vs. spinner) y rompía la hidratación. El efecto lo resuelve
  // apenas monta.
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (yaCargado) { setListo(true); return; }
    let vivo = true;
    (async () => {
      try {
        // Los materiales viven en plan_materiales, no en la fila del plan, así
        // que se piden aparte y se inyectan en la plantilla.
        const [plan, mats] = await Promise.all([
          getPlan(editarId!),
          listPlanMateriales(editarId!),
        ]);
        if (vivo && plan) {
          cargarDesde(editarId!, planADraft(plan), {
            ...planAPlantilla(plan),
            materiales: mats.map(m => ({ parte_id: m.parte_id, cantidad: m.cantidad })),
          });
        }
      } finally {
        if (vivo) setListo(true);
      }
    })();
    return () => { vivo = false; };
  }, [editarId, yaCargado, cargarDesde]);

  if (!listo) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  return <PlanCrearFormInner key={editarId ?? "nuevo"} />;
}

function PlanCrearFormInner() {
  const router = useRouter();
  const { draft, setDraft, plantilla, reset, editandoId } = usePlanDraft();

  // El estado arranca del borrador, no vacío: así volver de la plantilla
  // reconstruye el formulario tal como estaba.
  const [nombre, setNombre] = useState(draft.nombre);
  const [activoId, setActivoId] = useState<string | null>(draft.activoId);
  const [recurrencia, setRecurrencia] = useState<RecurrenciaPlan | "">(draft.recurrencia as RecurrenciaPlan | "");
  const [intervalo, setIntervalo] = useState(draft.intervalo);

  // Días de la semana, 0=Dom … 6=Sáb — el mismo índice que Date.getDay(), que
  // es como los lee el avanzador de OTCrearForm.
  //
  // Diaria y semanal los usan distinto, y por eso son dos estados:
  //   diaria  — en qué días corre (por defecto todos; deseleccionar excluye).
  //   semanal — el día en que cae (uno solo).
  // Compartir un estado haría que cambiar de recurrencia arrastrara la
  // selección anterior a un control donde no significa lo mismo.
  const [diasSemana, setDiasSemana] = useState<number[]>(draft.diasSemana);
  const [diaSemanal, setDiaSemanal] = useState(draft.diaSemanal);

  // mensual_fecha: el día del mes (1–31).
  const [diaDelMes, setDiaDelMes] = useState(draft.diaDelMes);
  // mensual_dia: "el 2º Martes" — ordinal de la semana + día.
  const [ordinalSemana, setOrdinalSemana] = useState(draft.ordinalSemana);
  const [diaOrdinal, setDiaOrdinal] = useState(draft.diaOrdinal);
  const [fechaInicio, setFechaInicio] = useState(draft.fechaInicio);
  const [fechaFin, setFechaFin] = useState(draft.fechaFin);
  // Hora de vencimiento, opcional: "el 8 a las 09:00". Viaja a la OT generada.
  // Vacía = vence el día, sin hora — que es lo normal en una mantención mensual.
  const [horaVencimiento, setHoraVencimiento] = useState(draft.horaVencimiento);
  const [diasApertura, setDiasApertura] = useState(draft.diasApertura);
  const [diasAviso, setDiasAviso] = useState(draft.diasAviso);

  // El horizonte se guarda siempre en días; la unidad es solo comodidad de
  // entrada ("4 semanas" se lee mejor que "28 días").
  const [horizonteNum, setHorizonteNum] = useState(draft.horizonteNum);
  const [horizonteUnidad, setHorizonteUnidad] = useState<"dias" | "semanas" | "meses">(draft.horizonteUnidad);
  const horizonteDias =
    horizonteUnidad === "dias"    ? horizonteNum
    : horizonteUnidad === "semanas" ? horizonteNum * 7
    : horizonteNum * 30;

  const [activos, setActivos] = useState<ActivoOpt[]>([]);
  const [activoSearch, setActivoSearch] = useState("");
  const [activoOpen, setActivoOpen] = useState(false);
  const activoBoxRef = useRef<HTMLDivElement | null>(null);


  const [openSec, setOpenSec] = useState({ activo: true, programa: true, detalles: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id")
        .eq("id", auth?.user?.id ?? "")
        .maybeSingle();
      const wsId = perfil?.workspace_id;
      if (!wsId) return;

      const { data } = await sb
        .from("activos")
        .select("id, nombre, imagen_url, estado")
        // Primera página nada más: la búsqueda consulta al servidor, así que no
        // hace falta tener el catálogo entero en memoria.
        .eq("workspace_id", wsId)
        .eq("activo", true)
        .order("nombre")
        .limit(ACTIVOS_PAGE_SIZE);
      setActivos((data ?? []) as ActivoOpt[]);
    }
    load();
  }, []);

  // Un popover que solo se cierra al elegir deja la tarjeta elevada tapando lo
  // de abajo, así que cerrarlo es parte del mismo arreglo de apilamiento.
  // `mousedown` y no `click`: si el usuario aprieta fuera, el popover debe irse
  // antes de que el clic llegue a lo que hay detrás.
  useEffect(() => {
    if (!activoOpen) return;

    function onDown(e: MouseEvent) {
      if (!activoBoxRef.current?.contains(e.target as Node)) setActivoOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActivoOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activoOpen]);

  const activoSel = activos.find(a => a.id === activoId) ?? null;

  /**
   * La búsqueda consulta al servidor en vez de filtrar en memoria: con un
   * catálogo grande, traerlo entero para filtrar 8 filas es justo lo que se
   * quiere evitar. El debounce evita una request por tecla.
   */
  useEffect(() => {
    const q = activoSearch.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id")
        .eq("id", auth?.user?.id ?? "").maybeSingle();
      if (!perfil?.workspace_id) return;

      const { data } = await sb
        .from("activos")
        .select("id, nombre, imagen_url, estado")
        .eq("workspace_id", perfil.workspace_id)
        .eq("activo", true)
        .ilike("nombre", `%${q}%`)
        .order("nombre")
        .limit(ACTIVOS_PAGE_SIZE);
      setActivos((data ?? []) as ActivoOpt[]);
    }, 250);
    return () => clearTimeout(t);
  }, [activoSearch]);

  // Ya vienen filtrados y acotados por el servidor; el slice solo recorta la
  // lista visible del desplegable.
  const activosFiltrados = useMemo(() => activos.slice(0, 8), [activos]);

  /**
   * Vuelca el formulario al borrador y navega a la plantilla.
   *
   * Se guarda ANTES de navegar porque el componente se desmonta al cambiar de
   * ruta: sin esto, el usuario volvería a un formulario en blanco.
   */
  function irAPlantilla() {
    setDraft({
      nombre, activoId,
      recurrencia, intervalo,
      diasSemana, diaSemanal, diaDelMes, ordinalSemana, diaOrdinal,
      fechaInicio, fechaFin, horaVencimiento,
      diasApertura, diasAviso, horizonteNum, horizonteUnidad,
    });
    router.push("/planes/crear/plantilla");
  }

  /** Horas + minutos a horas decimales, que es como lo guarda el plan. */
  function horasEstimadas(): number | null {
    const h = Number(plantilla.tiempo_h) || 0;
    const m = Number(plantilla.tiempo_m) || 0;
    if (h === 0 && m === 0) return null;
    return Math.round((h + m / 60) * 100) / 100;
  }

  /**
   * Traduce los controles al `recurrencia_config` que ya entiende el resto de
   * la app (weekdays, day_of_month, interval — los mismos campos que lee el
   * avanzador de OTCrearForm), para que un plan mensual y una OT mensual caigan
   * el mismo día.
   *
   * Solo se guarda lo que la recurrencia elegida usa: mandar `weekdays` en un
   * plan anual dejaría basura que el próximo lector tendría que adivinar si
   * significa algo.
   */
  function buildConfig(): RecurrenciaConfig | null {
    switch (recurrencia) {
      case "diaria":
        // 7 de 7 es "todos los días": se omite porque no restringe nada.
        return diasSemana.length === 7
          ? { interval: 1 }
          : { interval: 1, weekdays: [...diasSemana].sort((a, b) => a - b) };
      case "semanal":
        return { interval: intervalo, weekdays: [diaSemanal] };
      case "mensual":
      case "mensual_fecha":
        return { interval: intervalo, day_of_month: diaDelMes };
      case "mensual_dia":
        // `week_ordinal` (1–4, o -1 = último) es campo nuevo: el avanzador
        // todavía no lo lee y trata mensual_dia como mensual_fecha. Se guarda
        // igual para no perder la intención del usuario cuando se implemente.
        return { interval: intervalo, weekdays: [diaOrdinal], week_ordinal: ordinalSemana };
      case "anual":
        return { interval: intervalo };
      default:
        return null;
    }
  }

  const puedeCrear =
    nombre.trim().length > 0 && !!activoId && recurrencia !== "" && !!fechaInicio;

  async function handleCrear() {
    if (!puedeCrear || saving) return;
    setSaving(true);
    setError(null);
    try {
      const form: PlanForm = {
        nombre: nombre.trim(),
        activo_id: activoId!,
        recurrencia: recurrencia as RecurrenciaPlan,
        recurrencia_config: buildConfig(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin || null,
        hora_vencimiento: horaVencimiento || null,
        titulo_ot: plantilla.titulo.trim() || null,
        descripcion_ot: plantilla.descripcion.trim() || null,
        categoria_id: plantilla.categoria_id || null,
        // Siempre preventiva: un plan genera trabajo planificado, y los KPIs de
        // preventivo vs. correctivo dependen de que no varíe.
        tipo_trabajo: "preventiva",
        prioridad: plantilla.prioridad || null,
        asignados_ids: plantilla.asignados_ids,
        procedimiento_ids: plantilla.procedimiento_ids,
        adjuntos: plantilla.adjuntos,
        materiales: plantilla.materiales,
        proveedor_id: plantilla.proveedor_id || null,
        duracion_estimada_horas: horasEstimadas(),
        dias_apertura_previa: diasApertura,
        dias_aviso_previo: diasAviso,
        horizonte_dias: horizonteDias,
      };
      let destinoId: string;
      if (editandoId) {
        // Al editar se reprograman las fechas: cambiar recurrencia o fecha de
        // inicio invalida las ocurrencias futuras ya calculadas.
        await updatePlan(editandoId, form, true);
        destinoId = editandoId;
      } else {
        const plan = await createPlan(form);
        destinoId = plan.id;
      }
      // El borrador ya se guardó: limpiarlo evita que "nuevo plan" abra con los
      // datos del anterior.
      reset();
      router.push(`/planes?id=${destinoId}`);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo crear el plan.");
      setSaving(false);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* Encabezado */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/planes")}
          aria-label="Volver"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 6, border: "none",
            background: "transparent", color: "var(--fg-3)", cursor: "pointer",
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", margin: 0 }}>
          {editandoId ? "Editar plan de mantención" : "Nuevo plan de mantención"}
        </h1>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 90px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Plan sin título (Necesario)"
            autoFocus
            style={{
              width: "100%", border: "none", borderBottom: "1px solid var(--border)",
              background: "transparent", padding: "6px 2px 10px", marginBottom: 22,
              fontSize: 20, fontWeight: 400, color: "var(--fg-1)",
              fontFamily: "inherit", outline: "none",
            }}
          />

          {/* ── Activo ─────────────────────────────────────────────────── */}
          <Section
            titulo="Activo"
            descripcion="Elija el activo donde se aplicará este plan de mantención."
            open={openSec.activo}
            onToggle={() => setOpenSec(s => ({ ...s, activo: !s.activo }))}
            elevada={activoOpen && !activoSel}
          >
            <label style={labelStyle}>Seleccionar activo</label>
            {activoSel ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", background: "var(--surface-1)", maxWidth: 420,
              }}>
                {/* Miniatura del equipo: se reconoce sin leer, igual que en la
                    tarjeta de la lista de planes. */}
                {activoSel.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activoSel.imagen_url}
                    alt=""
                    style={{
                      width: 36, height: 36, borderRadius: "var(--r-sm)",
                      objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0,
                    }}
                  />
                ) : (
                  <span style={{
                    width: 36, height: 36, borderRadius: "var(--r-sm)", flexShrink: 0,
                    background: "var(--brand-tint)", color: "var(--brand)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Box size={18} />
                  </span>
                )}

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: "block", fontSize: 14, color: "var(--fg-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {activoSel.nombre}
                  </span>
                  {/* Estado del equipo: importa al programar mantenciones sobre
                      algo que está fuera de servicio o dado de baja. Punto de
                      color + etiqueta, como en la bandeja de activos. */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 14, color: "var(--fg-3)", marginTop: 1,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: ESTADO_ACTIVO_COLOR[activoSel.estado ?? ""] ?? "#94A3B8",
                    }} />
                    {ESTADO_ACTIVO_LABEL[activoSel.estado ?? ""] ?? "Sin estado"}
                  </span>
                </span>

                <button
                  onClick={() => { setActivoId(null); setActivoSearch(""); }}
                  aria-label="Quitar activo"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-4)", display: "flex", flexShrink: 0 }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div ref={activoBoxRef} style={{ position: "relative", maxWidth: 420 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  border: "1px solid var(--border)", borderRadius: 8,
                  padding: "9px 12px", background: "var(--surface-1)",
                }}>
                  <Search size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                  <input
                    value={activoSearch}
                    onChange={e => { setActivoSearch(e.target.value); setActivoOpen(true); }}
                    onFocus={() => setActivoOpen(true)}
                    placeholder="Empiece a escribir…"
                    style={{
                      flex: 1, border: "none", background: "transparent", outline: "none",
                      fontSize: 14, color: "var(--fg-1)", fontFamily: "inherit",
                    }}
                  />
                </div>
                {activoOpen && activosFiltrados.length > 0 && (
                  <div style={{
                    // 200 es lo que usan los demás popovers de formulario
                    // (OTEditPanel, OTFiltrosPanel). Ordena contra los hermanos
                    // dentro de la tarjeta; salir de ella es cosa de `elevada`.
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                    background: "var(--surface-1)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "var(--shadow-lg)", overflow: "hidden",
                  }}>
                    {activosFiltrados.map(a => (
                      <button
                        key={a.id}
                        onClick={() => { setActivoId(a.id); setActivoOpen(false); setActivoSearch(""); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%",
                          padding: "9px 12px", border: "none", background: "transparent",
                          cursor: "pointer", fontSize: 14, color: "var(--fg-1)",
                          fontFamily: "inherit", textAlign: "left",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {/* Miniatura y estado también al elegir: es lo que
                            distingue dos equipos del mismo nombre. */}
                        {a.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.imagen_url}
                            alt=""
                            style={{
                              width: 28, height: 28, borderRadius: "var(--r-sm)",
                              objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0,
                            }}
                          />
                        ) : (
                          <span style={{
                            width: 28, height: 28, borderRadius: "var(--r-sm)", flexShrink: 0,
                            background: "var(--brand-tint)", color: "var(--brand)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Box size={15} />
                          </span>
                        )}
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.nombre}
                        </span>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: ESTADO_ACTIVO_COLOR[a.estado ?? ""] ?? "#94A3B8",
                        }} />
                      </button>
                    ))}
                  </div>
                )}
                {activos.length === 0 && (
                  <p style={{ ...hintStyle, marginTop: 8 }}>
                    No hay activos registrados todavía.
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* ── Programa ───────────────────────────────────────────────── */}
          <Section
            titulo="Programa"
            descripcion="Especifique con qué frecuencia se crearán las órdenes de trabajo."
            open={openSec.programa}
            onToggle={() => setOpenSec(s => ({ ...s, programa: !s.programa }))}
          >
            <label style={labelStyle}>Recurrencia</label>
            <select
              value={recurrencia}
              onChange={e => setRecurrencia(e.target.value as RecurrenciaPlan | "")}
              style={{ ...inputStyle, maxWidth: 420 }}
            >
              <option value="">Seleccionar recurrencia</option>
              {RECURRENCIAS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            {/* Cada recurrencia pide lo suyo: un plan diario y uno mensual por
                día de la semana no se configuran con los mismos campos. */}

            {recurrencia === "diaria" && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Se repite cada día</label>
                <DiasSemana
                  seleccion={diasSemana}
                  onToggle={d => setDiasSemana(prev =>
                    // No dejar la selección vacía: sin días el plan no corre
                    // nunca. El último día activo no se puede desmarcar.
                    prev.includes(d)
                      ? (prev.length > 1 ? prev.filter(x => x !== d) : prev)
                      : [...prev, d].sort()
                  )}
                />
                <p style={hintStyle}>
                  {diasSemana.length === 7
                    ? "Todos los días."
                    : "Solo los días marcados."}
                </p>
              </div>
            )}

            {recurrencia === "semanal" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Cada</span>
                  <select
                    value={intervalo}
                    onChange={e => setIntervalo(Number(e.target.value))}
                    style={{ ...inputStyle, width: 74 }}
                  >
                    {NUMEROS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                    {intervalo === 1 ? "semana el" : "semanas el"}
                  </span>
                </div>
                <DiasSemana
                  seleccion={[diaSemanal]}
                  onToggle={d => setDiaSemanal(d)}
                />
              </div>
            )}

            {(recurrencia === "mensual" || recurrencia === "mensual_fecha") && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Cada</span>
                <select
                  value={intervalo}
                  onChange={e => setIntervalo(Number(e.target.value))}
                  style={{ ...inputStyle, width: 74 }}
                >
                  {NUMEROS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                  {intervalo === 1 ? "mes en el" : "meses en el"}
                </span>
                <select
                  value={diaDelMes}
                  onChange={e => setDiaDelMes(Number(e.target.value))}
                  style={{ ...inputStyle, width: 84 }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}º</option>
                  ))}
                </select>
              </div>
            )}

            {recurrencia === "mensual_dia" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Cada</span>
                  <select
                    value={intervalo}
                    onChange={e => setIntervalo(Number(e.target.value))}
                    style={{ ...inputStyle, width: 74 }}
                  >
                    {NUMEROS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                    {intervalo === 1 ? "mes en el" : "meses en el"}
                  </span>
                  <select
                    value={ordinalSemana}
                    onChange={e => setOrdinalSemana(Number(e.target.value))}
                    style={{ ...inputStyle, width: 94 }}
                  >
                    <option value={1}>1º</option>
                    <option value={2}>2º</option>
                    <option value={3}>3º</option>
                    <option value={4}>4º</option>
                    <option value={-1}>último</option>
                  </select>
                  <select
                    value={diaOrdinal}
                    onChange={e => setDiaOrdinal(Number(e.target.value))}
                    style={{ ...inputStyle, width: 124 }}
                  >
                    {DIAS_LARGOS.map((nombre, i) => (
                      <option key={i} value={i}>{nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {recurrencia === "anual" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Cada</span>
                <select
                  value={intervalo}
                  onChange={e => setIntervalo(Number(e.target.value))}
                  style={{ ...inputStyle, width: 74 }}
                >
                  {NUMEROS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                  {intervalo === 1 ? "año" : "años"}
                </span>
              </div>
            )}


            {/* Todo lo que sigue depende de la recurrencia: sin ella, "primer
                vencimiento" y "horizonte" no tienen de qué colgar. Aparece
                recién al elegirla para no abrir con un muro de campos. */}
            {recurrencia !== "" && (
            <>
            <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />

            <label style={labelStyle}>
              Primer vencimiento <span style={{ color: "var(--fg-4)", fontWeight: 400 }}>(Necesario)</span>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="date"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
                style={{ ...inputStyle, maxWidth: 220 }}
              />
              <input
                type="time"
                value={horaVencimiento}
                onChange={e => setHoraVencimiento(e.target.value)}
                aria-label="Hora de vencimiento (opcional)"
                style={{ ...inputStyle, maxWidth: 150 }}
              />
            </div>
            <p style={hintStyle}>
              Cuándo debe estar hecha la primera mantención. Desde esta fecha se
              calculan todas las siguientes. La hora es opcional y la hereda cada
              orden generada.
            </p>

            <label style={{ ...labelStyle, marginTop: 18 }}>Hasta (opcional)</label>
            <input
              type="date"
              value={fechaFin}
              min={fechaInicio || undefined}
              onChange={e => setFechaFin(e.target.value)}
              style={{ ...inputStyle, maxWidth: 220 }}
            />
            <p style={hintStyle}>Déjelo vacío para que el plan siga indefinidamente.</p>

            <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />

            <label style={labelStyle}>Abrir la orden de trabajo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min={0} max={365}
                value={diasApertura}
                onChange={e => setDiasApertura(Math.max(0, Number(e.target.value) || 0))}
                style={{ ...inputStyle, width: 84 }}
              />
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>días antes del vencimiento</span>
            </div>
            <p style={hintStyle}>
              Cuándo aparece la OT para trabajarla. Con un valor bajo el equipo no ve
              órdenes abiertas que todavía no tocan.
            </p>

            <label style={{ ...labelStyle, marginTop: 18 }}>Avisar con anticipación</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min={0} max={365}
                value={diasAviso}
                onChange={e => setDiasAviso(Math.max(0, Number(e.target.value) || 0))}
                style={{ ...inputStyle, width: 84 }}
              />
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>días antes del vencimiento</span>
            </div>
            <p style={hintStyle}>
              Aviso para preparar la mantención — con tiempo para conseguir los insumos.
              Es independiente de cuándo se abre la orden.
            </p>

            <label style={{ ...labelStyle, marginTop: 18 }}>Horizonte de programación</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="number" min={1} max={999}
                value={horizonteNum}
                onChange={e => setHorizonteNum(Math.max(1, Number(e.target.value) || 1))}
                style={{ ...inputStyle, width: 84 }}
              />
              <select
                value={horizonteUnidad}
                onChange={e => setHorizonteUnidad(e.target.value as "dias" | "semanas" | "meses")}
                style={{ ...inputStyle, width: 130 }}
              >
                <option value="dias">Días</option>
                <option value="semanas">Semanas</option>
                <option value="meses">Meses</option>
              </select>
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>por adelantado</span>
            </div>
            <p style={hintStyle}>
              Con cuánta antelación se calculan las fechas futuras. Se agregan nuevas
              automáticamente para mantener el horizonte.
            </p>
            </>
            )}
          </Section>

          {/* ── Detalles de la OT ──────────────────────────────────────── */}
          {/* La plantilla vive en su propia pantalla: son los mismos campos
              que una OT completa y aquí solo se resume lo definido. */}
          <Section
            titulo="Detalles de la orden de trabajo"
            descripcion="Valores por defecto que incluirá cada orden creada a partir de este plan."
            open={openSec.detalles}
            onToggle={() => setOpenSec(s => ({ ...s, detalles: !s.detalles }))}
          >
            {plantilla.definida ? (
              <ResumenPlantilla
                plantilla={plantilla}
                nombrePlan={nombre}
                onEditar={irAPlantilla}
              />
            ) : (
              <>
                <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 14px" }}>
                  No se añadieron detalles de orden de trabajo.
                </p>
                <button
                  type="button"
                  onClick={irAPlantilla}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 15px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface-1)",
                    color: "var(--brand)", fontSize: 14, fontWeight: 500,
                    fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  Añadir detalles de orden de trabajo
                </button>
              </>
            )}
          </Section>

          {error && (
            <p style={{ fontSize: 14, color: "var(--danger, #b42318)", marginTop: 16 }}>{error}</p>
          )}
        </div>
      </div>

      {/* Pie */}
      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 10,
        padding: "12px 20px", borderTop: "1px solid var(--border)",
        background: "var(--surface-canvas)", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/planes")}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface-1)", color: "var(--fg-2)",
            fontSize: 14, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleCrear}
          disabled={!puedeCrear || saving}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 18px", borderRadius: 8, border: "none",
            background: puedeCrear ? "var(--brand)" : "var(--surface-3, #e5e7eb)",
            color: puedeCrear ? "#fff" : "var(--fg-4)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit",
            cursor: puedeCrear && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {editandoId ? "Guardar" : "Crear"}
        </button>
      </div>
    </div>
  );
}

/* ── piezas ────────────────────────────────────────────────────────────── */

/**
 * `elevada` levanta la tarjeta completa por sobre las siguientes.
 *
 * Hace falta porque un popover que se sale de su tarjeta pelea contra dos cosas
 * a la vez, y arreglar solo una no se nota:
 *
 *   1. `overflow` recortaba el popover en el borde de la tarjeta. Por eso aquí
 *      es `visible` cuando la sección está elevada — con `hidden` no hay
 *      z-index que valga, el dropdown se corta igual.
 *   2. Las tarjetas se pintan en orden del DOM, así que la de abajo tapa lo que
 *      sobresale de la de arriba. Un z-index dentro del popover no alcanza: al
 *      quedar en el contexto de apilamiento de SU tarjeta, compite con los hijos
 *      de esa tarjeta, nunca con la tarjeta siguiente. Lo que tiene que subir
 *      es la tarjeta entera.
 *
 * El z-index vive en la tarjeta y no en el popover, entonces, y solo mientras
 * hay algo abierto: una tarjeta elevada de forma permanente volvería a tapar a
 * las de abajo cuando le toque a ellas abrir algo.
 */
function Section({
  titulo, descripcion, open, onToggle, children, elevada = false,
}: {
  titulo: string;
  descripcion: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  elevada?: boolean;
}) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10,
      // Relleno del lienzo: la sección delimita sin destacarse y lo que resalta
      // son los controles de adentro, que sí van en --surface-1.
      background: "var(--surface-canvas)", marginBottom: 18,
      overflow: elevada ? "visible" : "hidden",
      position: "relative",
      zIndex: elevada ? 30 : undefined,
    }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
          padding: "16px 18px", border: "none", background: "transparent",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>{titulo}</div>
          <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 3 }}>{descripcion}</div>
        </div>
        {open
          ? <ChevronUp size={16} style={{ color: "var(--fg-4)", flexShrink: 0, marginTop: 2 }} />
          : <ChevronDown size={16} style={{ color: "var(--fg-4)", flexShrink: 0, marginTop: 2 }} />}
      </button>
      {open && (
        <div style={{ padding: "18px", borderTop: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Lo definido en la plantilla, resumido.
 *
 * Muestra solo lo que el usuario llenó: un resumen que lista "Sin categoría",
 * "Sin ubicación" y "Sin asignados" no informa nada y hace parecer incompleto
 * algo que está bien así.
 */
function ResumenPlantilla({
  plantilla, nombrePlan, onEditar,
}: {
  plantilla: PlantillaOT;
  nombrePlan: string;
  onEditar: () => void;
}) {
  const prio = PRIORIDADES.find(p => p.value === plantilla.prioridad);
  const horas = Number(plantilla.tiempo_h) || 0;
  const mins = Number(plantilla.tiempo_m) || 0;

  const filas: { icono: React.ReactNode; texto: string }[] = [];
  // Preventiva siempre: se muestra para que quede explícito qué clase de
  // trabajo genera el plan, aunque no sea elegible.
  filas.push({ icono: <Wrench size={16} />, texto: "Preventiva" });
  if (prio && prio.value !== "ninguna") filas.push({ icono: <Flag size={16} />, texto: prio.label });
  if (plantilla.asignados_ids.length > 0) {
    filas.push({
      icono: <User size={16} />,
      texto: `${plantilla.asignados_ids.length} asignado${plantilla.asignados_ids.length > 1 ? "s" : ""}`,
    });
  }
  if (horas > 0 || mins > 0) {
    filas.push({
      icono: <Clock size={16} />,
      texto: [horas > 0 ? `${horas} h` : null, mins > 0 ? `${mins} min` : null].filter(Boolean).join(" "),
    });
  }
  if (plantilla.procedimiento_ids.length > 0) {
    filas.push({
      icono: <ClipboardCheck size={16} />,
      texto: `${plantilla.procedimiento_ids.length} procedimiento${plantilla.procedimiento_ids.length > 1 ? "s" : ""}`,
    });
  }
  if (plantilla.materiales.length > 0) {
    filas.push({
      icono: <Package size={16} />,
      texto: `${plantilla.materiales.length} material${plantilla.materiales.length > 1 ? "es" : ""}`,
    });
  }
  if (plantilla.adjuntos.length > 0) {
    filas.push({
      icono: <Paperclip size={16} />,
      texto: `${plantilla.adjuntos.length} adjunto${plantilla.adjuntos.length > 1 ? "s" : ""}`,
    });
  }

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 14px", border: "1px solid var(--border)",
        borderRadius: 8, background: "var(--surface-canvas)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>
            {plantilla.titulo.trim() || nombrePlan.trim() || "Orden sin título"}
          </div>
          {plantilla.descripcion.trim() && (
            <div style={{
              fontSize: 14, color: "var(--fg-3)", marginTop: 3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {plantilla.descripcion.trim()}
            </div>
          )}
          {filas.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 9 }}>
              {filas.map((f, i) => (
                <span key={i} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 14, color: "var(--fg-3)",
                }}>
                  <span style={{ display: "inline-flex", color: "var(--brand)" }}>
                    {f.icono}
                  </span>
                  {f.texto}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEditar}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--surface-1)",
            color: "var(--fg-2)", fontSize: 14, fontFamily: "inherit",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          <Pencil size={13} />
          Editar
        </button>
      </div>
    </div>
  );
}

/**
 * Fila de días de la semana. Sirve para dos cosas distintas según quién la use:
 * selección múltiple (diaria: en qué días corre) o única (semanal: en qué día
 * cae). El componente no decide cuál — solo pinta lo que recibe en `seleccion`
 * y avisa del clic; el padre define si acumula o reemplaza.
 */
function DiasSemana({
  seleccion, onToggle,
}: {
  seleccion: number[];
  onToggle: (dia: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {DIAS_CORTOS.map((nombre, i) => {
        const activo = seleccion.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            aria-pressed={activo}
            style={{
              minWidth: 56, padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${activo ? "var(--brand)" : "var(--border)"}`,
              background: activo ? "var(--brand-tint)" : "var(--surface-1)",
              color: activo ? "var(--brand)" : "var(--fg-2)",
              fontSize: 14, fontWeight: activo ? 500 : 400,
              fontFamily: "inherit", cursor: "pointer",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            {nombre}
          </button>
        );
      })}
    </div>
  );
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const NUMEROS = Array.from({ length: 12 }, (_, i) => i + 1);

const labelStyle: CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 500,
  color: "var(--fg-2)", marginBottom: 7,
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 14, color: "var(--fg-1)",
  background: "var(--surface-1)", fontFamily: "inherit", outline: "none",
  width: "100%",
};

const hintStyle: CSSProperties = {
  fontSize: 14, color: "var(--fg-3)", margin: "7px 0 0",
};
