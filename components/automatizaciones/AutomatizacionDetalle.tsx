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
import { Loader2, MoreVertical, Pencil } from "lucide-react";
import {
  fetchEjecuciones, toggleAutomatizacion, describirTrigger, MODOS,
  type AutomatizacionCompleta, type ResultadoEjecucion,
} from "@/lib/automatizaciones-api";
import type { MedidorConUltima } from "@/lib/medidores-api";
import { btnSecundario, btnIcono, seccionDetalle } from "@/components/catalogo/PanelCatalogo";

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

const PRIORIDAD_LABEL: Record<string, string> = {
  ninguna: "Ninguna", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Rótulo arriba, valor abajo. Mismo `Dato` que la ficha de un medidor. */
function Dato({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div style={{ padding: "8px 0" }}>
      <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", marginBottom: 4 }}>{label}</span>
      <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)", lineHeight: 1.6 }}>{valor}</span>
    </div>
  );
}

function tituloSeccion(texto: string) {
  return (
    <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", margin: "0 0 10px" }}>{texto}</h2>
  );
}

export default function AutomatizacionDetalle({
  automatizacion: a, medidores, usuarios, puedeEditar = true, onEditar, onEliminar,
}: {
  automatizacion: AutomatizacionCompleta;
  medidores: MedidorConUltima[];
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

  const accion = a.acciones[0] ?? null;
  const config = accion?.config ?? {};

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

  const asignados = (config.asignados_ids ?? []).length;
  const nombresAsignados = (config.asignados_ids ?? [])
    .map(id => usuarios?.find(u => u.id === id)?.nombre)
    .filter(Boolean)
    .join(", ");

  return (
    <div style={{ padding: "0 28px 76px", width: "100%", boxSizing: "border-box" }}>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28,
        paddingTop: 24, paddingBottom: 20,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, overflowWrap: "break-word" }}>
            {a.nombre}
          </h1>
          {a.descripcion && (
            <p style={{ fontSize: 14, color: "var(--fg-2)", margin: "6px 0 0", lineHeight: 1.6 }}>{a.descripcion}</p>
          )}
        </div>
        <div style={{ display: puedeEditar ? "flex" : "none", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onEditar} style={btnSecundario}>
            <Pencil size={14} /> Editar
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

      {/* Habilitar */}
      <div style={seccionDetalle}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--fg-1)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={a.activa}
            disabled={guardandoToggle || !puedeEditar}
            onChange={e => { void cambiarActiva(e.target.checked); }}
          />
          Habilitar la automatización
          {guardandoToggle && <Loader2 size={13} className="animate-spin" style={{ color: "var(--fg-4)" }} />}
        </label>
        <p style={{ margin: "6px 0 0 24px", fontSize: 14, color: "var(--fg-4)" }}>
          {a.activa
            ? "Cada lectura que cumpla la condición la evalúa."
            : "Pausada: las lecturas no la disparan."}
        </p>
      </div>

      {/* Activador */}
      <div style={seccionDetalle}>
        {tituloSeccion("Activador")}
        {a.triggers.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>Sin disparadores.</p>
        ) : a.triggers.map(t => {
          const medidor = medidores.find(m => m.id === t.medidor_id);
          const modo = MODOS.find(m => m.value === t.modo);
          return (
            <div key={t.id} style={{ padding: "8px 0" }}>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)", lineHeight: 1.6 }}>
                Cuando: {medidor?.nombre ?? "Medidor eliminado"} {describirTrigger(t, medidor?.unidad ?? "")}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)", lineHeight: 1.6 }}>
                Para: {modo?.label ?? t.modo}
                {t.modo === "lecturas_multiples" && t.modo_n ? ` (${t.modo_n} lecturas)` : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Acción */}
      <div style={seccionDetalle}>
        {tituloSeccion("Acción")}
        {!accion ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>Sin acciones.</p>
        ) : (
          <>
            <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>Crear una orden de trabajo</span>
            {accion.retrigger_minutos > 0 && (
              <span style={{ display: "block", marginTop: 4, fontSize: 14, color: "var(--fg-3)" }}>
                Ejecutar como máximo una vez cada {accion.retrigger_minutos} minutos
              </span>
            )}
            {accion.solo_si_anterior_cerrada && (
              <span style={{ display: "block", marginTop: 4, fontSize: 14, color: "var(--fg-3)" }}>
                Sólo si la orden de trabajo anterior está cerrada
              </span>
            )}
            <div style={{ marginTop: 8 }}>
              <Dato label="Título" valor={config.titulo ?? null} />
              <Dato label="Descripción" valor={config.descripcion ?? null} />
              <Dato
                label="Asignados"
                valor={asignados === 0 ? null : (nombresAsignados || `${asignados} persona${asignados === 1 ? "" : "s"}`)}
              />
              <Dato
                label="Tiempo estimado"
                valor={config.tiempo_estimado ? `${Math.floor(config.tiempo_estimado / 60)} h ${config.tiempo_estimado % 60} min` : null}
              />
              <Dato
                label="Prioridad"
                valor={config.prioridad && config.prioridad !== "ninguna"
                  ? (PRIORIDAD_LABEL[config.prioridad] ?? config.prioridad)
                  : null}
              />
            </div>
          </>
        )}
      </div>

      {/* Historia de la acción */}
      <div style={seccionDetalle}>
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
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", border: "1px solid var(--border)",
                borderRadius: "var(--r-md)", background: "var(--surface-1)",
              }}>
                <span style={{
                  flexShrink: 0, fontSize: 14, padding: "1px 8px", borderRadius: "var(--r-sm)",
                  color: RESULTADO_COLOR[e.resultado], background: "var(--surface-hover)",
                }}>
                  {RESULTADO_LABEL[e.resultado]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
                    {fmtFecha(e.created_at)}
                    {e.valor != null && ` · ${e.valor}${unidadPrincipal ? ` ${unidadPrincipal}` : ""}`}
                  </span>
                  {/* El motivo: sin esto, una omisión es indistinguible de que
                      el motor no se enteró de la lectura. */}
                  {e.detalle && (
                    <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
                      {e.detalle}
                    </span>
                  )}
                  {e.resultado === "ejecutada" && e.orden_id && (
                    <a
                      href={`/ordenes?id=${e.orden_id}`}
                      style={{ display: "inline-block", marginTop: 4, fontSize: 14, color: "var(--brand)" }}
                    >
                      Ver orden de trabajo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
