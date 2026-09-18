"use client";

/**
 * Ficha de una automatización: qué la dispara, qué hace y qué hizo.
 *
 * El bloque de abajo —"Historia de la acción"— es el que justifica la pantalla.
 * Una automatización que no actúa no deja rastro en ninguna otra parte de la
 * app: sin el historial, "registré la lectura y no pasó nada" no tiene respuesta.
 * Por eso las filas `omitida` muestran su `detalle` tal cual: ahí está escrito
 * el motivo (el retrigger, la OT anterior abierta, el modo sin rearmar).
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, Box, Check, CheckCircle2, Clock, Flag, FileText, Gauge, GitBranch,
  Inbox, Loader2, Lock, MapPin, MinusCircle, MoreVertical, Paperclip, Pencil, Play,
  Settings2, SlidersHorizontal, Tag, User,
} from "lucide-react";
import {
  fetchEjecuciones, toggleAutomatizacion, describirTrigger, MODOS,
  type AutomatizacionCompleta, type ResultadoEjecucion,
} from "@/lib/automatizaciones-api";
import type { MedidorConUltima } from "@/lib/medidores-api";
import { btnIcono, seccionDetalle } from "@/components/catalogo/PanelCatalogo";
import { Paso, Tarjeta } from "@/components/automatizaciones/AutomatizacionCrearPanel";
import type { CategoriaOT } from "@/types/ordenes";

const RESULTADO_COLOR: Record<ResultadoEjecucion, string> = {
  ejecutada: "var(--success)",
  omitida: "var(--fg-4)",
  fallida: "var(--danger)",
};

const RESULTADO_LABEL: Record<ResultadoEjecucion, string> = {
  ejecutada: "Ejecutada",
  omitida: "Omitida",
  fallida: "Fallida",
};

/** El resultado como icono: el cartel repetido en cada fila era ruido. */
const RESULTADO_ICONO: Record<ResultadoEjecucion, React.ReactNode> = {
  ejecutada: <CheckCircle2 size={16} />,
  omitida: <MinusCircle size={16} />,
  fallida: <AlertCircle size={16} />,
};

const PRIORIDAD_LABEL: Record<string, string> = {
  ninguna: "Ninguna", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
};

const TIPO_TRABAJO_LABEL: Record<string, string> = {
  reactiva: "Reactiva", preventiva: "Preventiva", emergencia: "Emergencia",
  presupuesto: "Presupuesto", levantamiento: "Levantamiento",
};

/**
 * "Hoy a las 23:15", "Ayer a las 23:15", "13 sep a las 21:01".
 *
 * El año solo cuando no es el actual: en una lista de ejecuciones recientes
 * repetir "2026" en cada fila no distingue nada, y la hora sí importa —es lo
 * que se compara contra la lectura que se acaba de registrar.
 */
function fmtFecha(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  const hoy = new Date();
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
      - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000,
  );
  if (dias === 0) return `Hoy a las ${hora}`;
  if (dias === 1) return `Ayer a las ${hora}`;

  const fecha = d.toLocaleDateString("es-CL", {
    day: "numeric", month: "short",
    ...(d.getFullYear() === hoy.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${fecha} a las ${hora}`;
}

/**
 * Una fila de la ficha: icono en canaleta, "Rótulo: valor" en un renglón.
 *
 * El detalle repite las mismas tarjetas del constructor pero resumidas, así que
 * los campos van en una línea y no con la etiqueta encima como en `FieldRow`:
 * ahí se escribe, acá solo se lee.
 */
function FilaDato({ icono, label, valor, ultima }: {
  icono: React.ReactNode;
  label: string;
  valor: React.ReactNode;
  ultima?: boolean;
}) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 2px",
      borderBottom: ultima ? "none" : "1px solid var(--border)",
    }}>
      <span style={{ flexShrink: 0, display: "flex", paddingTop: 2, color: "var(--fg-3)" }}>{icono}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", lineHeight: 1.6 }}>
        <span style={{ color: "var(--fg-2)" }}>{label}: </span>{valor}
      </span>
    </div>
  );
}

/** Pill switch. El mismo de las preferencias de notificaciones. */
function Switch({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 23, padding: 2, flexShrink: 0,
        border: `1px solid ${checked ? "var(--brand)" : "var(--border-strong)"}`,
        borderRadius: 999,
        background: checked ? "var(--brand)" : "var(--surface-hover)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background .15s, border-color .15s",
        display: "flex", alignItems: "center",
      }}
    >
      <span style={{
        display: "grid", placeItems: "center",
        width: 17, height: 17, borderRadius: "50%",
        background: checked ? "#fff" : "var(--fg-4)",
        color: checked ? "var(--brand)" : "transparent",
        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        transform: checked ? "translateX(17px)" : "translateX(0)",
        transition: "transform .15s, background .15s",
      }}>
        {checked && <Check size={11} strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function tituloSeccion(texto: string) {
  return (
    <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", margin: "0 0 10px" }}>{texto}</h2>
  );
}

export default function AutomatizacionDetalle({
  automatizacion: a, medidores, usuarios, activos, ubicaciones, categorias,
  puedeEditar = true, onEditar, onEliminar,
}: {
  automatizacion: AutomatizacionCompleta;
  medidores: MedidorConUltima[];
  /** Los mismos catálogos del constructor, solo para resolver nombres. */
  activos?: { id: string; label: string }[];
  ubicaciones?: { id: string; label: string }[];
  categorias?: CategoriaOT[];
  /** Solo para poner nombre a `asignados_ids`. Vacío = se muestra el conteo. */
  usuarios?: { id: string; nombre: string }[];
  /** Falso esconde Editar y Eliminar. La RLS es la garantía; esto es la UI. */
  puedeEditar?: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const queryClient = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [guardandoToggle, setGuardandoToggle] = useState(false);

  const ejecuciones = useQuery({
    queryKey: ["automatizaciones", "ejecuciones", a.id],
    queryFn: () => fetchEjecuciones(a.id),
    // Corto a propósito: el usuario acaba de registrar una lectura en otra
    // pestaña y vuelve acá a ver si disparó. Un caché largo le miente.
    staleTime: 10 * 1000,
  });

  /** La unidad del medidor del primer disparador: es la que tienen los valores. */
  const unidadPrincipal = medidores.find(m => m.id === a.triggers[0]?.medidor_id)?.unidad ?? "";

  async function cambiarActiva(activa: boolean) {
    setGuardandoToggle(true);
    try {
      await toggleAutomatizacion(a.id, activa);
      await queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
    } finally {
      setGuardandoToggle(false);
    }
  }

  return (
    <div style={{ padding: "0 28px 24px", width: "100%", boxSizing: "border-box" }}>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28,
        paddingTop: 24, paddingBottom: 20,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, overflowWrap: "break-word" }}>
            {a.nombre}
          </h1>
          {a.descripcion && (
            <p style={{ fontSize: 14, color: "var(--fg-2)", margin: "6px 0 0", lineHeight: 1.6 }}>{a.descripcion}</p>
          )}
        </div>
        <div style={{ display: puedeEditar ? "flex" : "none", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* El mismo botón de marca que OTDetail: es la acción principal de
              una ficha, y en gris no se leía como tal. */}
          <button
            type="button" onClick={onEditar}
            style={{
              flexShrink: 0, height: 34, padding: "0 13px", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--brand)", border: "1px solid var(--brand)",
              borderRadius: "var(--r-sm)", cursor: "pointer",
              color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            <Pencil size={14} />
            Editar
          </button>
          {/* Eliminar en el menú y no suelto: es destructivo y se lleva el
              historial por CASCADE. */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setMenu(v => !v)} aria-label="Más acciones" style={btnIcono}>
              <MoreVertical size={16} />
            </button>
            {menu && (
              <>
                <span onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                <div style={{
                  position: "absolute", right: 0, top: 38, zIndex: 11, minWidth: 170,
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  borderRadius: 8, boxShadow: "var(--shadow-lg)", overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => { setMenu(false); onEliminar(); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 14, fontFamily: "inherit", color: "var(--danger)",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Habilitar: el mismo pill de las preferencias de notificaciones. */}
      <div style={{ ...seccionDetalle, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 20, color: "var(--fg-1)" }}>
          Habilitar la automatización
        </span>
        {guardandoToggle && <Loader2 size={13} className="animate-spin" style={{ color: "var(--fg-4)" }} />}
        <Switch
          checked={a.activa}
          disabled={guardandoToggle || !puedeEditar}
          label="Habilitar la automatización"
          onChange={v => { void cambiarActiva(v); }}
        />
      </div>

      {/* Activador y Acción: las mismas tarjetas del constructor —espinazo con
          medallón, encabezado celeste— pero de solo lectura. Quien acaba de
          armar la regla vuelve a ver la regla que armó, no otro formato. */}
      <div style={{ ...seccionDetalle, paddingTop: 22 }}>
        <Paso icono={<SlidersHorizontal size={15} />} titulo="Cuando pase esto">
          {a.triggers.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>Sin disparadores.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {a.triggers.map(t => {
                const medidor = medidores.find(m => m.id === t.medidor_id);
                const modo = MODOS.find(m => m.value === t.modo);
                return (
                  <Tarjeta
                    key={t.id}
                    titulo={`Cuando: ${medidor?.nombre ?? "Medidor eliminado"} ${describirTrigger(t, medidor?.unidad ?? "")}`}
                  >
                    <div>
                      <FilaDato icono={<Box size={15} />} label="Activo" valor={medidor?.activo_nombre ?? "Todos los activos"} />
                      <FilaDato icono={<Gauge size={15} />} label="Medidor" valor={medidor?.nombre ?? "Medidor eliminado"} />
                      <FilaDato
                        icono={<Clock size={15} />}
                        label="Para"
                        valor={`${modo?.label ?? t.modo}${t.modo === "lecturas_multiples" && t.modo_n ? ` (${t.modo_n} lecturas)` : ""}`}
                        ultima
                      />
                    </div>
                  </Tarjeta>
                );
              })}
            </div>
          )}
        </Paso>

        {/* El paso de condiciones se dibuja igual que en el constructor: sin él,
            la ficha y el formulario dejarían de leerse como la misma regla. */}
        <Paso icono={<GitBranch size={15} />} titulo="Sólo si además…">
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={15} /> Sin requisitos extra: actúa siempre que la lectura cumpla lo de arriba.
          </p>
        </Paso>

        <Paso icono={<Play size={15} />} titulo="Haz esto" ultimo>
          {a.acciones.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>Sin acciones.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {a.acciones.map(acc => {
                const c = acc.config ?? {};
                const frenos = [
                  acc.retrigger_minutos > 0 ? `Ejecutar como máximo una vez cada ${acc.retrigger_minutos} minutos` : null,
                  acc.solo_si_anterior_cerrada ? "Sólo si la orden anterior está cerrada" : null,
                ].filter(Boolean).join(" · ");
                const ids = c.asignados_ids ?? [];
                const nombres = ids
                  .map(id => usuarios?.find(u => u.id === id)?.nombre)
                  .filter(Boolean)
                  .join(", ");
                const cats = (c.categoria_ids ?? [])
                  .map(id => categorias?.find(k => k.id === id)?.nombre)
                  .filter(Boolean)
                  .join(", ");
                const archivos = (c.links ?? []).length;
                return (
                  <Tarjeta
                    key={acc.id}
                    titulo="Crear una orden de trabajo"
                    subtitulo={frenos || undefined}
                  >
                    <div>
                      <FilaDato icono={<Inbox size={15} />} label="Título" valor={c.titulo ?? null} />
                      <FilaDato icono={<FileText size={15} />} label="Descripción" valor={c.descripcion ?? null} />
                      <FilaDato
                        icono={<Settings2 size={15} />}
                        label="Tipo de trabajo"
                        valor={c.tipo_trabajo ? (TIPO_TRABAJO_LABEL[c.tipo_trabajo] ?? c.tipo_trabajo) : null}
                      />
                      <FilaDato
                        icono={<FileText size={15} />}
                        label="Procedimientos"
                        valor={(c.procedimiento_ids ?? []).length > 0
                          ? `${c.procedimiento_ids!.length}`
                          : null}
                      />
                      <FilaDato
                        icono={<Paperclip size={15} />}
                        label="Adjuntos"
                        valor={archivos > 0 ? `${archivos} archivo${archivos === 1 ? "" : "s"}` : null}
                      />
                      <FilaDato
                        icono={<MapPin size={15} />}
                        label="Ubicación"
                        valor={c.ubicacion_id ? (ubicaciones?.find(u => u.id === c.ubicacion_id)?.label ?? "—") : null}
                      />
                      <FilaDato
                        icono={<Box size={15} />}
                        label="Activo"
                        valor={c.activo_id ? (activos?.find(x => x.id === c.activo_id)?.label ?? "—") : null}
                      />
                      <FilaDato
                        icono={<User size={15} />}
                        label="Asignar a"
                        valor={ids.length === 0 ? null : (nombres || `${ids.length} persona${ids.length === 1 ? "" : "s"}`)}
                      />
                      <FilaDato
                        icono={<Clock size={15} />}
                        label="Tiempo estimado"
                        valor={c.tiempo_estimado ? `${Math.floor(c.tiempo_estimado / 60)} h ${c.tiempo_estimado % 60} min` : null}
                      />
                      <FilaDato
                        icono={<Flag size={15} />}
                        label="Prioridad"
                        valor={c.prioridad && c.prioridad !== "ninguna"
                          ? (PRIORIDAD_LABEL[c.prioridad] ?? c.prioridad)
                          : null}
                      />
                      <FilaDato icono={<Tag size={15} />} label="Categorías" valor={cats || null} ultima />
                    </div>
                  </Tarjeta>
                );
              })}
            </div>
          )}
        </Paso>
      </div>

      {/* Historia de la acción. Sin borde abajo: es la última sección y la
          línea, con el relleno del final, se leía como una caja vacía. */}
      <div style={{ ...seccionDetalle, borderBottom: "none" }}>
        {tituloSeccion("Historia de la acción")}
        {ejecuciones.isLoading ? (
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />
        ) : (ejecuciones.data ?? []).length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>
            Todavía no se ha ejecutado. Registra una lectura que cumpla la condición y aparecerá acá.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(ejecuciones.data ?? []).map(e => (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", border: "1px solid var(--border)",
                borderRadius: "var(--r-md)", background: "var(--surface-1)",
              }}>
                {/* El icono lleva `title` y texto para lector de pantalla: sin
                    el cartel, el color solo no dice el resultado. */}
                <span
                  title={RESULTADO_LABEL[e.resultado]}
                  style={{ flexShrink: 0, display: "flex", position: "relative", color: RESULTADO_COLOR[e.resultado] }}
                >
                  {RESULTADO_ICONO[e.resultado]}
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    {RESULTADO_LABEL[e.resultado]}
                  </span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-1)" }}>
                    {fmtFecha(e.created_at)}
                    {e.valor != null && (
                      <>
                        <Gauge size={14} style={{ flexShrink: 0, color: "var(--fg-3)" }} />
                        {e.valor}{unidadPrincipal ? ` ${unidadPrincipal}` : ""}
                      </>
                    )}
                  </span>
                  {/* El motivo: sin esto, una omisión es indistinguible de que
                      el motor no se enteró de la lectura. */}
                  {e.detalle && (
                    <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
                      {e.detalle}
                    </span>
                  )}
                </div>
                {e.resultado === "ejecutada" && e.orden_id && (
                  <a
                    href={`/ordenes?id=${e.orden_id}`}
                    style={{ flexShrink: 0, fontSize: 14, color: "var(--brand)", whiteSpace: "nowrap" }}
                  >
                    Ver orden de trabajo
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
