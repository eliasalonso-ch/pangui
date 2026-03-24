"use client";
import {
  X, CircleDot, PauseCircle, PlayCircle,
  ChevronDown, Minus, ChevronUp, AlertTriangle,
  Plus, Repeat, ClipboardCheck, Trash2, ExternalLink, RefreshCw, Paperclip, FileText,
} from "lucide-react";
import styles from "@/app/(app)/ordenes/page.module.css";

const ESTADO_COLOR = {
  pendiente:   { bg: "#EFF6FF", text: "#3B82F6" },
  en_espera:   { bg: "#FFFBEB", text: "#D97706" },
  en_curso:    { bg: "#EEF2FF", text: "#6366F1" },
  en_revision: { bg: "#EEF2FF", text: "#6366F1" },
  completado:  { bg: "#F0FDF4", text: "#22C55E" },
  cancelado:   { bg: "#F3F4F6", text: "#6B7280" },
};

const TIPO_TRABAJO_LABEL = {
  reactiva:   "Reactiva",
  preventiva: "Preventiva",
  inspeccion: "Inspección",
  mejora:     "Mejora",
};

const RECURRENCIA_LABEL = {
  ninguna:       "Sin recurrencia",
  diaria:        "Diaria",
  semanal:       "Semanal",
  mensual_fecha: "Mensual (por fecha)",
  mensual_dia:   "Mensual (por día)",
  anual:         "Anual",
};

export default function PanelCrearOT({
  form, setF, ubicaciones, activos, categorias, plantillas, partesCatalogo = [],
  saving, error, showNuevUbic, setShowNuevUbic, showNuevActivo, setShowNuevActivo,
  crearUbicacion, crearActivo, addParte, setParte, setParteFields, removeParte, onGuardar, onCerrar,
  pendingFiles = [], setPendingFiles, createFileRef,
  archivos = [], fileRef, uploadingFile, subirArchivo, eliminarArchivo,
  isEdit = false, showHints = false,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{isEdit ? "Editar orden de trabajo" : "Nueva orden de trabajo"}</h2>
        <button className={styles.panelClose} onClick={onCerrar}><X size={18} /></button>
      </div>
      <div className={styles.panelBody}>
        {/* Título */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Título</label>
          {showHints && <span className={styles.fieldHint}>Ej: "Cambio de luminarias pasillo 3" — sé específico para que el técnico entienda de qué se trata</span>}
          <input className={styles.formInput} placeholder="Ej: Cambio de luminarias pasillo 3"
            value={form.titulo} onChange={(e) => setF("titulo", e.target.value)} />
        </div>

        {/* Estado */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Estado</label>
          {showHints && <span className={styles.fieldHint}>El estado inicial suele ser "Abierta" — cámbialo cuando el técnico empiece a trabajar</span>}
          <div className={styles.statusGrid}>
            {[
              { value: "pendiente",  label: "Abierta",   Icon: CircleDot },
              { value: "en_espera",  label: "En espera", Icon: PauseCircle },
              { value: "en_curso",   label: "En curso",  Icon: PlayCircle },
            ].map(({ value, label, Icon }) => {
              const col = ESTADO_COLOR[value] ?? { bg: "#F3F4F6", text: "#6B7280" };
              const active = form.estado === value;
              return (
                <button key={value} type="button"
                  className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
                  style={active ? { background: col.bg, color: col.text, borderColor: col.text } : {}}
                  onClick={() => setF("estado", value)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prioridad */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Prioridad</label>
          {showHints && <span className={styles.fieldHint}>Usa "Urgente" solo si hay riesgo de daño o parada de producción — reservarlo ayuda a priorizar bien</span>}
          <div className={styles.prioGrid}>
            {[
              { value: "baja",    label: "Baja",    Icon: ChevronDown,   color: "#9CA3AF" },
              { value: "media",   label: "Media",   Icon: Minus,         color: "#3B82F6" },
              { value: "alta",    label: "Alta",    Icon: ChevronUp,     color: "#F97316" },
              { value: "urgente", label: "Urgente", Icon: AlertTriangle, color: "#EF4444" },
            ].map(({ value, label, Icon, color }) => {
              const active = form.prioridad === value;
              return (
                <button key={value} type="button"
                  className={`${styles.prioBtn} ${active ? styles.prioBtnActive : ""}`}
                  style={active ? { color, borderColor: color, background: `${color}18` } : {}}
                  onClick={() => setF("prioridad", value)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Categoría */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Categoría</label>
          {showHints && <span className={styles.fieldHint}>Clasifica el trabajo (Eléctrico, Mecánico, etc.) para filtrar y reportar fácilmente</span>}
          <select className={styles.formSelect} value={form.categoria_id} onChange={(e) => setF("categoria_id", e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {/* Descripción */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción</label>
          {showHints && <span className={styles.fieldHint}>Describe el problema con detalle: síntomas, cuándo ocurrió, qué herramientas podría necesitar el técnico</span>}
          <textarea className={styles.formTextarea} rows={3} placeholder="Describe el trabajo a realizar…"
            value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} />
        </div>

        {/* Tipo de trabajo */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Tipo de trabajo</label>
          {showHints && <span className={styles.fieldHint}>Reactiva = algo se rompió. Preventiva = mantenimiento programado. Inspección = revisión sin intervención</span>}
          <div className={styles.pillToggle}>
            {["reactiva","preventiva","inspeccion","mejora"].map((t) => (
              <button key={t} className={`${styles.pillToggleBtn} ${form.tipo_trabajo === t ? styles.pillToggleBtnActive : ""}`}
                onClick={() => setF("tipo_trabajo", t)}>
                {TIPO_TRABAJO_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Ubicación */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Ubicación</label>
          {showHints && <span className={styles.fieldHint}>¿Dónde está el problema? (Ej: Sala de máquinas, Piso 2). Si no existe aún, créala con el botón +</span>}
          <div className={styles.fieldWithAction}>
            <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => setF("ubicacion_id", e.target.value)}>
              <option value="">Sin ubicación</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.edificio}{u.piso ? ` · Piso ${u.piso}` : ""}{u.detalle ? ` · ${u.detalle}` : ""}
                </option>
              ))}
            </select>
            <button className={styles.addInlineBtn} onClick={() => setShowNuevUbic((v) => !v)} title="Nueva ubicación">
              <Plus size={14} />
            </button>
          </div>
          {showNuevUbic && (
            <div className={styles.inlineAddRow}>
              <input className={styles.formInput} placeholder="Nombre de la ubicación"
                value={form.nueva_ubicacion} onChange={(e) => setF("nueva_ubicacion", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearUbicacion()} />
              <button className={styles.btnSm} onClick={crearUbicacion}>Agregar</button>
            </div>
          )}
        </div>

        {/* Activo */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Activo / Equipo</label>
          {showHints && <span className={styles.fieldHint}>La máquina o equipo específico que necesita atención. Asociarlo permite ver el historial de mantención</span>}
          <div className={styles.fieldWithAction}>
            <select className={styles.formSelect} value={form.activo_id} onChange={(e) => setF("activo_id", e.target.value)}>
              <option value="">Sin activo</option>
              {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.codigo ? ` (${a.codigo})` : ""}</option>)}
            </select>
            <button className={styles.addInlineBtn} onClick={() => setShowNuevActivo((v) => !v)} title="Nuevo activo">
              <Plus size={14} />
            </button>
          </div>
          {showNuevActivo && (
            <div className={styles.inlineAddRow}>
              <input className={styles.formInput} placeholder="Nombre del equipo o activo"
                value={form.nuevo_activo} onChange={(e) => setF("nuevo_activo", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearActivo()} />
              <button className={styles.btnSm} onClick={crearActivo}>Agregar</button>
            </div>
          )}
        </div>

        {/* Fechas */}
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Fecha inicio</label>
            <input type="date" className={styles.formInput} value={form.fecha_inicio}
              onChange={(e) => setF("fecha_inicio", e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Fecha límite</label>
            <input type="date" className={styles.formInput} value={form.fecha_termino}
              onChange={(e) => setF("fecha_termino", e.target.value)} />
          </div>
        </div>
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Tiempo estimado</label>
            <div className={styles.tiempoRow}>
              <input type="number" min="0" className={styles.formInputSm} placeholder="0"
                value={form.tiempo_estimado_h} onChange={(e) => setF("tiempo_estimado_h", e.target.value)} />
              <span className={styles.tiempoUnit}>h</span>
              <input type="number" min="0" max="59" className={styles.formInputSm} placeholder="0"
                value={form.tiempo_estimado_m} onChange={(e) => setF("tiempo_estimado_m", e.target.value)} />
              <span className={styles.tiempoUnit}>min</span>
            </div>
          </div>
        </div>

        {/* Recurrencia */}
        <div className={styles.formField}>
          <label className={styles.formLabel}><Repeat size={12} style={{ marginRight: 4 }} />Recurrencia</label>
          <select className={styles.formSelect} value={form.recurrencia} onChange={(e) => setF("recurrencia", e.target.value)}>
            {Object.entries(RECURRENCIA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Pauta de mantención */}
        <div className={styles.formField}>
          <div className={styles.fieldLabelRow}>
            <label className={styles.formLabel}><ClipboardCheck size={12} style={{ marginRight: 4 }} />Pauta de mantención</label>
            <a href="/ordenes/crear/pautas" className={styles.fieldLabelLink}>Administrar pautas <ExternalLink size={11} /></a>
          </div>
          <select className={styles.formSelect} value={form.plantilla_id} onChange={(e) => setF("plantilla_id", e.target.value)}>
            <option value="">Sin pauta</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {/* Repuestos requeridos */}
        <div className={styles.formField}>
          <div className={styles.sectionHeaderRow}>
            <label className={styles.formLabel}>Repuestos requeridos</label>
            <button className={styles.addLinkBtn} onClick={addParte}><Plus size={13} /> Agregar</button>
          </div>
          {form.partes.length > 0 && (
            <div className={styles.partesList}>
              {form.partes.map((p, i) => (
                <div key={i} className={styles.parteRow}>
                  {partesCatalogo.length > 0 ? (
                    p.parte_id === "__otro__" ? (
                      <input className={styles.formInputFlex} placeholder="Nombre del repuesto"
                        value={p.nombre} onChange={(e) => setParte(i, "nombre", e.target.value)} />
                    ) : (
                      <select className={styles.formInputFlex}
                        value={p.parte_id || ""}
                        onChange={(e) => {
                          if (e.target.value === "__otro__") {
                            setParteFields(i, { parte_id: "__otro__", nombre: "", unidad: "un" });
                          } else {
                            const found = partesCatalogo.find(pc => pc.id === e.target.value);
                            if (found) {
                              setParteFields(i, { parte_id: found.id, nombre: found.nombre, unidad: found.unidad || "un" });
                            }
                          }
                        }}>
                        <option value="">Seleccionar repuesto…</option>
                        {partesCatalogo.map(pc => (
                          <option key={pc.id} value={pc.id}>
                            {pc.nombre}{pc.codigo ? ` (${pc.codigo})` : ""}{pc.stock_actual != null ? ` — stock: ${pc.stock_actual}` : ""}
                          </option>
                        ))}
                        <option value="__otro__">Otro (ingresar manualmente)</option>
                      </select>
                    )
                  ) : (
                    <input className={styles.formInputFlex} placeholder="Nombre del repuesto"
                      value={p.nombre} onChange={(e) => setParte(i, "nombre", e.target.value)} />
                  )}
                  <input type="number" min="1" className={styles.formInputSm2}
                    value={p.cantidad} onChange={(e) => setParte(i, "cantidad", e.target.value)} />
                  <select className={styles.formSelectSm} value={p.unidad} onChange={(e) => setParte(i, "unidad", e.target.value)}>
                    <option value="un">un</option>
                    <option value="kg">kg</option>
                    <option value="m">m</option>
                    <option value="lt">lt</option>
                    <option value="caja">caja</option>
                  </select>
                  <button className={styles.removeBtn} onClick={() => removeParte(i)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Archivos adjuntos en modo edición */}
        {isEdit && subirArchivo && (
          <div className={styles.formField}>
            <div className={styles.sectionHeaderRow}>
              <label className={styles.formLabel}><Paperclip size={13} style={{ marginRight: 5 }} />Archivos adjuntos</label>
              <button type="button" className={styles.addLinkBtn} onClick={() => fileRef?.current?.click()} disabled={uploadingFile}>
                {uploadingFile ? "Subiendo…" : <><Plus size={13} /> Adjuntar</>}
              </button>
            </div>
            <input ref={fileRef} type="file" style={{ display: "none" }} multiple
              onChange={(e) => { [...(e.target.files ?? [])].forEach(subirArchivo); e.target.value = ""; }} />
            {archivos.length > 0 && (
              <div className={styles.archivosList}>
                {archivos.map((a) => (
                  <div key={a.id} className={styles.archivoItem}>
                    <FileText size={14} className={styles.archivoIcon} />
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className={styles.archivoNombre}>{a.nombre}</a>
                    {a.tamano_kb && <span className={styles.archivoSize}>{a.tamano_kb} KB</span>}
                    <button type="button" className={styles.archivoDelete} onClick={() => eliminarArchivo(a.id, a.url)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Archivos adjuntos (solo en creación) */}
        {!isEdit && setPendingFiles && (
          <div className={styles.formField}>
            <div className={styles.sectionHeaderRow}>
              <label className={styles.formLabel}><Paperclip size={13} style={{ marginRight: 5 }} />Archivos adjuntos</label>
              <button type="button" className={styles.addLinkBtn} onClick={() => createFileRef?.current?.click()}>
                <Plus size={13} /> Adjuntar
              </button>
            </div>
            <input ref={createFileRef} type="file" style={{ display: "none" }} multiple
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                setPendingFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }} />
            {pendingFiles.length > 0 && (
              <div className={styles.archivosList}>
                {pendingFiles.map((f, i) => (
                  <div key={i} className={styles.archivoItem}>
                    <FileText size={14} className={styles.archivoIcon} />
                    <span className={styles.archivoNombre}>{f.name}</span>
                    <span className={styles.archivoSize}>{Math.round(f.size / 1024)} KB</span>
                    <button type="button" className={styles.archivoDelete}
                      onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Guardar como preventivo */}
        {!isEdit && (
          <div className={styles.preventivoSection}>
            <label className={styles.preventivoToggle}>
              <input
                type="checkbox"
                checked={!!form.guardarComoPreventivo}
                onChange={(e) => setF("guardarComoPreventivo", e.target.checked)}
              />
              <RefreshCw size={13} />
              <span>Guardar como preventivo (mantenimiento recurrente)</span>
            </label>
            {form.guardarComoPreventivo && (
              <div className={styles.preventivoExtra}>
                <label className={styles.formLabel}>Repetir cada</label>
                <div className={styles.tiempoRow}>
                  <input
                    type="number" min="1"
                    className={styles.formInputSm}
                    placeholder="30"
                    value={form.frecuencia_dias}
                    onChange={(e) => setF("frecuencia_dias", e.target.value)}
                  />
                  <span className={styles.tiempoUnit}>días</span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className={styles.formError}>{error}</p>}
      </div>

      <div className={styles.panelFooter}>
        <button className={styles.btnGhost} onClick={onCerrar}>Cancelar</button>
        <button className={styles.btnPrimary} onClick={onGuardar} disabled={saving}>
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear OT"}
        </button>
      </div>
    </div>
  );
}
