"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import FotoUpload from "@/components/FotoUpload";
import styles from "./page.module.css";

// ── Helpers ───────────────────────────────────────────────────

function formatId(orden) {
  const year = new Date(orden.created_at).getFullYear();
  const suffix = orden.id.slice(-4).toUpperCase();
  return `${orden.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuracion(min) {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const BADGE_CLASS = {
  pendiente: styles.badgePendiente,
  en_curso: styles.badgeEnCurso,
  en_revision: styles.badgeEnRevision,
  completado: styles.badgeCompletado,
  cancelado: styles.badgeCancelado,
};

const BADGE_LABEL = {
  pendiente: "pendiente",
  en_curso: "en curso",
  en_revision: "en revisión",
  completado: "completado",
  cancelado: "cancelado",
};

const ESTADOS = [
  "pendiente",
  "en_curso",
  "en_revision",
  "completado",
  "cancelado",
];

// ── Page ──────────────────────────────────────────────────────

export default function JefeOrdenDetallePage() {
  const { id } = useParams();
  const router = useRouter();

  const [orden, setOrden] = useState(undefined);
  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);

  // edit mode
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    tipo: "",
    descripcion: "",
    ubicacion_id: "",
    numero_meconecta: "",
    tecnico_id: "",
    estado: "",
    observacion: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // cancel confirmation
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  // approve (en_revision → completado)
  const [aprobando, setAprobando] = useState(false);

  const cargarOrden = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(
        "*, " +
          "tecnicos:usuarios(nombre), " +
          "ubicaciones(edificio, piso, detalle)",
      )
      .eq("id", id)
      .maybeSingle();
    if (data) setOrden(data);
  }, [id]);

  const cargarMateriales = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("materiales_usados")
      .select("*")
      .eq("orden_id", id)
      .order("created_at");
    if (data) setMateriales(data);
  }, [id]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id, rol")
        .eq("id", user.id)
        .maybeSingle();
      if (!perfil) {
        router.push("/login");
        return;
      }

      const pId = perfil.planta_id;

      const [, , { data: ubics }, { data: tecns }] = await Promise.all([
        cargarOrden(),
        cargarMateriales(),
        supabase
          .from("ubicaciones")
          .select("id, edificio, piso, detalle")
          .eq("planta_id", pId)
          .eq("activa", true)
          .order("edificio"),
        supabase
          .from("usuarios")
          .select("id, nombre")
          .eq("planta_id", pId)
          .eq("rol", "tecnico")
          .order("nombre"),
      ]);

      setUbicaciones(ubics ?? []);
      setTecnicos(tecns ?? []);
      setCargando(false);
    }
    init();
  }, [id, cargarOrden, cargarMateriales, router]);

  // ── Edit helpers ─────────────────────────────────────────────

  function abrirEdicion() {
    if (!orden) return;

    setEditForm({
      tipo: orden?.tipo ?? "",
      descripcion: orden?.descripcion ?? "",
      ubicacion_id: orden?.ubicacion_id ?? "",
      numero_meconecta: orden?.numero_meconecta ?? "",
      tecnico_id: orden?.tecnico_id ?? "",
      estado: orden?.estado ?? "pendiente",
      observacion: orden?.observacion ?? "",
    });
    setEditError(null);
    setEditMode(true);
  }

  function setEdit(field, value) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  async function guardarEdicion() {
    if (!editForm.descripcion.trim()) {
      setEditError("La descripción no puede estar vacía.");
      return;
    }
    setEditError(null);
    setSavingEdit(true);

    const supabase = createClient();
    const patch = {
      tipo: editForm.tipo,
      descripcion: editForm.descripcion.trim(),
      ubicacion_id: editForm.ubicacion_id || null,
      numero_meconecta: editForm.numero_meconecta.trim() || null,
      tecnico_id: editForm.tecnico_id || null,
      estado: editForm.estado,
      observacion: editForm.observacion.trim() || null,
    };

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update(patch)
      .eq("id", id);

    if (error) {
      setEditError(error.message);
      setSavingEdit(false);
      return;
    }
    await cargarOrden();
    setSavingEdit(false);
    setEditMode(false);
  }

  async function aprobarOrden() {
    setAprobando(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ estado: "completado" })
      .eq("id", id);
    await cargarOrden();
    setAprobando(false);
  }

  async function cancelarOrden() {
    setCancelando(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ estado: "cancelado" })
      .eq("id", id);
    await cargarOrden();
    setCancelando(false);
    setConfirmCancelar(false);
  }

  // ── Render ────────────────────────────────────────────────────

  if (cargando || orden === undefined) {
    return <p className={styles.loading}>Cargando…</p>;
  }
  if (!orden) return <p className={styles.notFound}>Orden no encontrada.</p>;

  const esEmergencia = orden.tipo === "emergencia";
  const cancelada = orden.estado === "cancelado";

  return (
    <main className={styles.main}>
      {/* Volver */}
      <button className={styles.btnVolver} onClick={() => router.push("/jefe")}>
        ← Volver al panel
      </button>

      {/* ── Jefe actions bar ── */}
      {!editMode && !cancelada && (
        <div className={styles.jefeActions}>
          {orden.estado === "en_revision" && (
            <button
              className={styles.btnAprobar}
              onClick={aprobarOrden}
              disabled={aprobando}
            >
              {aprobando ? "Aprobando…" : "✓ Aprobar trabajo"}
            </button>
          )}
          <button className={styles.btnEditar} onClick={abrirEdicion}>
            Editar
          </button>
          <button
            className={styles.btnCancelarOrden}
            onClick={() => setConfirmCancelar(true)}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* ── Info card ── */}
      <div
        className={`${styles.card} ${esEmergencia ? styles.cardEmergencia : ""}`}
      >
        {!editMode ? (
          <>
            <div className={styles.cardTop}>
              <span className={styles.ordenId}>{formatId(orden)}</span>
              <span
                className={`${styles.badge} ${BADGE_CLASS[orden.estado] ?? ""}`}
              >
                {BADGE_LABEL[orden.estado] ?? orden.estado}
              </span>
            </div>
            {esEmergencia && (
              <span
                className={`${styles.badge} ${styles.badgeEmergencia} ${styles.badgeTipoRow}`}
              >
                🚨 emergencia
              </span>
            )}
            {orden.ubicaciones && (
              <p className={styles.ubicacion}>
                {orden.ubicaciones.edificio}
                {orden.ubicaciones.piso
                  ? ` · Piso ${orden.ubicaciones.piso}`
                  : ""}
                {orden.ubicaciones.detalle
                  ? ` · ${orden.ubicaciones.detalle}`
                  : ""}
              </p>
            )}
            <p className={styles.descripcion}>{orden?.descripcion}</p>
            {orden.tecnicos?.nombre && (
              <p className={styles.meta}>
                Técnico: <strong>{orden.tecnicos.nombre}</strong>
              </p>
            )}
            {orden.numero_meconecta && (
              <p className={styles.meta}>
                Ref. Me Conecta: <strong>{orden.numero_meconecta}</strong>
              </p>
            )}
            <p className={styles.metaFecha}>
              Creada: {formatDateTime(orden.created_at)}
            </p>
          </>
        ) : (
          /* ── Edit form ── */
          <>
            <div className={styles.cardTop}>
              <span className={styles.ordenId}>{formatId(orden)}</span>
            </div>

            {/* Tipo toggle */}
            <div className={styles.editSection}>
              <span className={styles.editTitle}>Tipo</span>
              <div className={styles.tipoToggle}>
                <button
                  type="button"
                  className={`${styles.tipoBtn} ${editForm.tipo === "solicitud" ? styles.tipoBtnSolicitud : ""}`}
                  onClick={() => setEdit("tipo", "solicitud")}
                >
                  Solicitud
                </button>
                <button
                  type="button"
                  className={`${styles.tipoBtn} ${editForm.tipo === "emergencia" ? styles.tipoBtnEmergencia : ""}`}
                  onClick={() => setEdit("tipo", "emergencia")}
                >
                  🚨 Emergencia
                </button>
              </div>
            </div>

            {/* Estado */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Estado</label>
              <select
                className={styles.editSelect}
                value={editForm.estado}
                onChange={(e) => setEdit("estado", e.target.value)}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {BADGE_LABEL[e] ?? e}
                  </option>
                ))}
              </select>
            </div>

            {/* Ubicación */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Ubicación</label>
              <select
                className={styles.editSelect}
                value={editForm.ubicacion_id}
                onChange={(e) => setEdit("ubicacion_id", e.target.value)}
              >
                <option value="">Sin ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.edificio}
                    {u.piso ? ` · Piso ${u.piso}` : ""}
                    {u.detalle ? ` · ${u.detalle}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Técnico */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Técnico asignado</label>
              <select
                className={styles.editSelect}
                value={editForm.tecnico_id}
                onChange={(e) => setEdit("tecnico_id", e.target.value)}
              >
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Ref. Me Conecta */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Ref. Me Conecta</label>
              <input
                className={styles.editInput}
                type="text"
                placeholder="Opcional"
                value={editForm.numero_meconecta ?? ""}
                onChange={(e) => setEdit("numero_meconecta", e.target.value)}
              />
            </div>

            {/* Descripción */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Descripción</label>
              <textarea
                className={styles.editTextarea}
                rows={3}
                value={editForm.descripcion ?? ""}
                onChange={(e) => setEdit("descripcion", e.target.value)}
              />
            </div>

            {/* Observación */}
            <div className={styles.editSection}>
              <label className={styles.editTitle}>Observación</label>
              <textarea
                className={styles.editTextarea}
                rows={3}
                placeholder="Opcional"
                value={editForm.observacion ?? ""}
                onChange={(e) => setEdit("observacion", e.target.value)}
              />
            </div>

            {editError && <p className={styles.editError}>{editError}</p>}

            <div className={styles.editActions}>
              <button
                className={styles.btnEditCancel}
                onClick={() => setEditMode(false)}
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                className={styles.btnEditSave}
                onClick={guardarEdicion}
                disabled={savingEdit}
              >
                {savingEdit ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Resumen (si completado) ── */}
      {orden.estado === "completado" && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Resumen</h2>
          <div className={styles.resumenGrid}>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Inicio</span>
              <span className={styles.resumenVal}>
                {formatDateTime(orden.hora_inicio)}
              </span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Término</span>
              <span className={styles.resumenVal}>
                {formatDateTime(orden.hora_termino)}
              </span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Duración</span>
              <span
                className={`${styles.resumenVal} ${styles.resumenDuracion}`}
              >
                {formatDuracion(orden.duracion_min)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Firma de conformidad ── */}
      {orden.firma_solicitante && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Firma de conformidad</h2>
          <div className={styles.firmaView}>
            {orden.nombre_solicitante && (
              <p className={styles.firmaNombre}>{orden.nombre_solicitante}</p>
            )}
            <img
              src={orden.firma_solicitante}
              alt="Firma del solicitante"
              className={styles.firmaImg}
            />
            {orden.firmado_at && (
              <p className={styles.firmaFecha}>
                Firmado: {formatDateTime(orden.firmado_at)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Evidencia fotográfica ── */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Evidencia fotográfica</h2>
        <FotoUpload ordenId={id} tipo="antes" readOnly={true} />
        <div className={styles.fotosDivider} />
        <FotoUpload ordenId={id} tipo="despues" readOnly={true} />
      </div>

      {/* ── Materiales ── */}
      {materiales.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Materiales usados</h2>
          <div className={styles.matList}>
            {materiales.map((m) => (
              <div key={m.id} className={styles.matRow}>
                <span className={styles.matNombre}>{m.nombre}</span>
                <span className={styles.matCant}>
                  {m.cantidad} {m.unidad}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Observación ── */}
      {orden.observacion && !editMode && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Observación</h2>
          <p className={styles.obsText}>{orden.observacion}</p>
        </div>
      )}

      {/* ── Confirm cancelar overlay ── */}
      {confirmCancelar && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setConfirmCancelar(false)}
        >
          <div
            className={styles.confirmCard}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.confirmText}>
              ¿Cancelar esta orden? El técnico no podrá actualizarla.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnConfirmNo}
                onClick={() => setConfirmCancelar(false)}
                disabled={cancelando}
              >
                Volver
              </button>
              <button
                className={styles.btnConfirmSi}
                onClick={cancelarOrden}
                disabled={cancelando}
              >
                {cancelando ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
