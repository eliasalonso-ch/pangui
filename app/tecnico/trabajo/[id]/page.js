"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import FotoUpload from "@/components/FotoUpload";
import FirmaCanvas from "@/components/FirmaCanvas";
import BuscadorMaterial from "@/components/BuscadorMaterial";
import styles from "./page.module.css";

const ESTADOS_EDITABLES = ["pendiente", "en_curso", "en_revision"];

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

const UNIDADES = ["un", "mt", "rollo", "kg", "lt", "caja"];

// ── Page ──────────────────────────────────────────────────────

export default function OrdenDetallePage() {
  const { id } = useParams();
  const router = useRouter();

  const [orden, setOrden] = useState(undefined);
  const [materiales, setMateriales] = useState([]);
  const [observacion, setObservacion] = useState("");
  const [plantaId, setPlantaId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showConfirmRevision, setShowConfirmRevision] = useState(false);
  const [firmaCapturada, setFirmaCapturada] = useState(null); // { base64, nombre }
  const [rechazoPopup, setRechazoPopup] = useState(null); // motivo string when rejected
  const [savingObs, setSavingObs] = useState(false);

  // ── Edit mode ────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [ubicaciones, setUbicaciones] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // ── Material edit ─────────────────────────────────────────────
  const [editingMatId, setEditingMatId] = useState(null);
  const [editingMatCant, setEditingMatCant] = useState("");

  // ── Material add state ───────────────────────────────────────
  const [matSeleccionado, setMatSeleccionado] = useState(null); // material from inventory
  const [matCantidad, setMatCantidad] = useState("");
  const [matUnidad, setMatUnidad] = useState("un");
  const [modoManual, setModoManual] = useState(false);
  const [matManualNombre, setMatManualNombre] = useState("");
  const [matManualCant, setMatManualCant] = useState("");
  const [matManualUnidad, setMatManualUnidad] = useState("un");
  const [addingMat, setAddingMat] = useState(false);
  const [matError, setMatError] = useState(null);

  // ── Loaders ──────────────────────────────────────────────────

  const cargarMateriales = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("materiales_usados")
      .select("*")
      .eq("orden_id", id)
      .order("created_at");
    if (data) setMateriales(data);
  }, [id]);

  const cargarOrden = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select("*, ubicaciones(edificio, piso, detalle)")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      setOrden(data);
      setObservacion(data.observacion ?? "");
    }
  }, [id]);

  // ── Init + realtime ──────────────────────────────────────────

  useEffect(() => {
    let channel;

    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id")
        .eq("id", user.id)
        .maybeSingle();
      if (perfil?.planta_id) {
        setPlantaId(perfil.planta_id);
        const { data: ubics } = await supabase
          .from("ubicaciones")
          .select("id, edificio, piso, detalle")
          .eq("planta_id", perfil.planta_id)
          .eq("activa", true)
          .order("edificio");
        setUbicaciones(ubics ?? []);
      }

      channel = supabase
        .channel(`orden-${id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "ordenes_trabajo",
          filter: `id=eq.${id}`,
        }, (payload) => {
          setOrden(payload.new);
          if (payload.new.rechazo_motivo && !payload.old?.rechazo_motivo) {
            setRechazoPopup(payload.new.rechazo_motivo);
          }
        })
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "materiales_usados",
          filter: `orden_id=eq.${id}`,
        }, cargarMateriales)
        .subscribe();

      await Promise.all([cargarOrden(), cargarMateriales()]);
      setCargando(false);
    }

    init();
    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [id, cargarOrden, cargarMateriales, router]);

  // ── Global refresh event ────────────────────────────────────

  useEffect(() => {
    const handler = () => { cargarOrden(); cargarMateriales(); };
    window.addEventListener("pangi:refresh", handler);
    return () => window.removeEventListener("pangi:refresh", handler);
  }, [cargarOrden, cargarMateriales]);

  // ── Actions ──────────────────────────────────────────────────

  async function iniciarTrabajo() {
    setStarting(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ estado: "en_curso", hora_inicio: new Date().toISOString() })
      .eq("id", id);
    await cargarOrden();
    setStarting(false);
  }

  async function guardarObservacion() {
    setSavingObs(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ observacion: observacion.trim() || null })
      .eq("id", id);
    setSavingObs(false);
  }

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

  async function guardarEdicion() {
    if (!editForm.descripcion.trim()) {
      setEditError("La descripción no puede estar vacía.");
      return;
    }
    setEditError(null);
    setSavingEdit(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({
        descripcion: editForm.descripcion.trim(),
        ubicacion_id: editForm.ubicacion_id || null,
        numero_meconecta: editForm.numero_meconecta.trim() || null,
      })
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

  async function completarConFirma() {
    if (!firmaCapturada?.base64) return;
    setCompleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({
        estado: "en_revision",
        hora_termino: new Date().toISOString(),
        observacion: observacion.trim() || null,
        firma_solicitante: firmaCapturada.base64,
        nombre_solicitante: firmaCapturada.nombre || null,
        firmado_at: new Date().toISOString(),
        rechazo_motivo: null,
      })
      .eq("id", id);
    if (error) {
      setCompleting(false);
      return;
    }
    // Notify the boss that work is ready for review
    if (plantaId) {
      fetch("/api/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planta_id_jefe: plantaId,
          titulo: "Trabajo listo para revisar",
          mensaje: orden?.descripcion?.slice(0, 60) ?? "",
          url: `/jefe/trabajo/${id}`,
        }),
      });
    }
    router.push("/tecnico");
  }

  // Selects a material from inventory — pre-fill unit
  function onSeleccionarMaterial(mat) {
    setMatSeleccionado(mat);
    setMatCantidad("");
    setMatUnidad(mat.unidad || "un");
    setMatError(null);
    setModoManual(false);
  }

  function cancelarSeleccion() {
    setMatSeleccionado(null);
    setMatCantidad("");
    setMatError(null);
  }

  // Add material linked to inventory (creates egreso movement)
  async function agregarDesdeInventario() {
    const cant = parseFloat(matCantidad);
    if (!cant || cant <= 0) {
      setMatError("Ingresa una cantidad válida.");
      return;
    }
    setMatError(null);
    setAddingMat(true);

    const supabase = createClient();

    // 1. Record used material on the order
    await supabase.from("materiales_usados").insert({
      orden_id: id,
      nombre: matSeleccionado.nombre,
      cantidad: cant,
      unidad: matUnidad,
    });

    // 2. Create egreso movement — trigger decrements stock automatically
    await supabase.from("movimientos_stock").insert({
      material_id: matSeleccionado.id,
      orden_id: id,
      tipo: "egreso",
      cantidad: cant,
      usuario_id: userId,
      nota: `Orden ${formatId(orden)}`,
    });

    setMatSeleccionado(null);
    setMatCantidad("");
    setAddingMat(false);
  }

  // Add material manually (no stock movement)
  async function agregarManualmente() {
    if (!matManualNombre.trim()) {
      setMatError("Ingresa el nombre del material.");
      return;
    }
    const cant = parseFloat(matManualCant);
    if (!cant || cant <= 0) {
      setMatError("Ingresa una cantidad válida.");
      return;
    }
    setMatError(null);
    setAddingMat(true);

    const supabase = createClient();
    await supabase.from("materiales_usados").insert({
      orden_id: id,
      nombre: matManualNombre.trim(),
      cantidad: cant,
      unidad: matManualUnidad,
    });

    setMatManualNombre("");
    setMatManualCant("");
    setMatManualUnidad("un");
    setModoManual(false);
    setAddingMat(false);
  }

  async function eliminarMaterial(matId) {
    const supabase = createClient();
    await supabase.from("materiales_usados").delete().eq("id", matId);
  }

  async function guardarCantidadMaterial(matId) {
    const cant = parseFloat(editingMatCant);
    if (!cant || cant <= 0) { setEditingMatId(null); return; }
    const supabase = createClient();
    await supabase.from("materiales_usados").update({ cantidad: cant }).eq("id", matId);
    setEditingMatId(null);
    setEditingMatCant("");
  }


  // ── Render ────────────────────────────────────────────────────

  if (cargando || orden === undefined) {
    return <p className={styles.loading}>Cargando…</p>;
  }
  if (!orden) return <p className={styles.notFound}>Orden no encontrada.</p>;

  const esEmergencia = orden.tipo === "emergencia";

  return (
    <main className={styles.main}>
      {/* Volver */}
      <button
        className={styles.btnVolver}
        onClick={() => router.push("/tecnico")}
      >
        ← Volver a mis órdenes
      </button>

      {/* ── Info card ── */}
      <div
        className={`${styles.card} ${esEmergencia ? styles.cardEmergencia : ""}`}
      >
        <div className={styles.cardTop}>
          <span className={styles.ordenId}>{formatId(orden)}</span>
          <div className={styles.cardTopRight}>
            <span
              className={`${styles.badge} ${BADGE_CLASS[orden.estado] ?? ""}`}
            >
              {BADGE_LABEL[orden.estado] ?? orden.estado}
            </span>
            {orden.estado_cobro === "pendiente_cobro" && (
              <span className={`${styles.badge} ${styles.badgeCobro}`}>Pendiente cobro</span>
            )}
            {orden.estado_cobro === "cobrado" && (
              <span className={`${styles.badge} ${styles.badgeCobrado}`}>Cobrado</span>
            )}
            {ESTADOS_EDITABLES.includes(orden.estado) && !editMode && (
              <button className={styles.btnEditar} onClick={abrirEdicion}>
                Editar
              </button>
            )}
          </div>
        </div>

        {editMode ? (
          <div className={styles.editFields}>
            {esEmergencia && (
              <span
                className={`${styles.badge} ${styles.badgeEmergencia} ${styles.badgeTipoRow}`}
              >
                🚨 emergencia
              </span>
            )}
            <div className={styles.editField}>
              <label className={styles.editLabel}>Descripción</label>
              <textarea
                className={styles.editTextarea}
                rows={3}
                value={editForm.descripcion}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, descripcion: e.target.value }))
                }
              />
            </div>
            <div className={styles.editField}>
              <label className={styles.editLabel}>Ubicación</label>
              <select
                className={styles.editSelect}
                value={editForm.ubicacion_id}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, ubicacion_id: e.target.value }))
                }
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
            <div className={styles.editField}>
              <label className={styles.editLabel}>Ref. Me Conecta</label>
              <input
                className={styles.editInput}
                type="text"
                placeholder="Opcional"
                value={editForm.numero_meconecta}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    numero_meconecta: e.target.value,
                  }))
                }
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
                {savingEdit ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <>
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
            {orden.numero_meconecta && (
              <p className={styles.meta}>
                Ref. Me Conecta: <strong>{orden.numero_meconecta}</strong>
              </p>
            )}
            <p className={styles.metaFecha}>
              Creada: {formatDateTime(orden.created_at)}
            </p>
          </>
        )}
      </div>

      {/* ── PENDIENTE ── */}
      {orden.estado === "pendiente" && (
        <div className={styles.actionSection}>
          <button
            className={styles.btnPrimary}
            onClick={iniciarTrabajo}
            disabled={starting}
          >
            {starting ? "Iniciando…" : "▶ Iniciar trabajo"}
          </button>
        </div>
      )}

      {/* ── EN CURSO ── */}
      {orden.estado === "en_curso" && (
        <>
          {/* Rejection banner */}
          {orden.rechazo_motivo && (
            <div className={styles.rechazoBanner}>
              <span className={styles.rechazoIcon}>❌</span>
              <div>
                <p className={styles.rechazoBannerTitle}>Trabajo rechazado</p>
                <p className={styles.rechazoBannerMotivo}>{orden.rechazo_motivo}</p>
              </div>
            </div>
          )}

          {/* Materiales usados */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Materiales usados</h2>

            {/* List of added materials */}
            {materiales.length > 0 && (
              <div className={styles.matList}>
                {materiales.map((m) => (
                  <div key={m.id} className={styles.matRow}>
                    <span className={styles.matNombre}>{m.nombre}</span>
                    {editingMatId === m.id ? (
                      <input
                        className={styles.matEditInput}
                        type="number"
                        min="0.01"
                        step="any"
                        autoFocus
                        value={editingMatCant}
                        onChange={(e) => setEditingMatCant(e.target.value)}
                        onBlur={() => guardarCantidadMaterial(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") guardarCantidadMaterial(m.id);
                          if (e.key === "Escape") setEditingMatId(null);
                        }}
                      />
                    ) : (
                      <button
                        className={styles.matCantBtn}
                        onClick={() => { setEditingMatId(m.id); setEditingMatCant(String(m.cantidad)); }}
                      >
                        {m.cantidad} {m.unidad}
                      </button>
                    )}
                    <button
                      className={styles.matDelete}
                      onClick={() => eliminarMaterial(m.id)}
                      aria-label={`Eliminar ${m.nombre}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Material add flow ── */}
            {!modoManual && !matSeleccionado && (
              <>
                <BuscadorMaterial
                  plantaId={plantaId}
                  onSelect={onSeleccionarMaterial}
                  placeholder="Buscar material en inventario…"
                />
                <button
                  type="button"
                  className={styles.btnManual}
                  onClick={() => {
                    setModoManual(true);
                    setMatError(null);
                  }}
                >
                  ¿No está en inventario? Agregar manualmente
                </button>
              </>
            )}

            {/* Selected material confirm panel */}
            {matSeleccionado && !modoManual && (
              <div className={styles.matConfirm}>
                <div className={styles.matConfirmInfo}>
                  <span className={styles.matConfirmNombre}>
                    {matSeleccionado.nombre}
                  </span>
                  <span className={styles.matConfirmCodigo}>
                    {matSeleccionado.codigo}
                  </span>
                </div>
                <p className={styles.matConfirmStock}>
                  Stock disponible:{" "}
                  <strong>
                    {Number(matSeleccionado.stock_actual)}{" "}
                    {matSeleccionado.unidad}
                  </strong>
                </p>
                {Number(matSeleccionado.stock_actual) <= 0 && (
                  <p className={styles.matConfirmAlerta}>
                    ⚠ Sin stock disponible
                  </p>
                )}
                <div className={styles.matConfirmForm}>
                  <input
                    className={`${styles.matInput} ${styles.matInputCant}`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Cantidad"
                    value={matCantidad}
                    onChange={(e) => setMatCantidad(e.target.value)}
                    autoFocus
                  />
                  <select
                    className={styles.matSelect}
                    value={matUnidad}
                    onChange={(e) => setMatUnidad(e.target.value)}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.matAdd}
                    onClick={agregarDesdeInventario}
                    disabled={addingMat}
                    aria-label="Agregar"
                  >
                    +
                  </button>
                </div>
                {matError && <p className={styles.matError}>{matError}</p>}
                <button
                  type="button"
                  className={styles.btnCancelarMat}
                  onClick={cancelarSeleccion}
                >
                  ← Buscar otro material
                </button>
              </div>
            )}

            {/* Manual entry form */}
            {modoManual && (
              <div className={styles.matManual}>
                <div className={styles.matForm}>
                  <input
                    className={styles.matInput}
                    placeholder="Nombre del material"
                    value={matManualNombre}
                    onChange={(e) => setMatManualNombre(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && agregarManualmente()}
                  />
                  <input
                    className={`${styles.matInput} ${styles.matInputCant}`}
                    placeholder="Cant."
                    type="number"
                    min="0"
                    step="any"
                    value={matManualCant}
                    onChange={(e) => setMatManualCant(e.target.value)}
                  />
                  <select
                    className={styles.matSelect}
                    value={matManualUnidad}
                    onChange={(e) => setMatManualUnidad(e.target.value)}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.matAdd}
                    onClick={agregarManualmente}
                    disabled={addingMat}
                    aria-label="Agregar material"
                  >
                    +
                  </button>
                </div>
                {matError && <p className={styles.matError}>{matError}</p>}
                <button
                  type="button"
                  className={styles.btnCancelarMat}
                  onClick={() => {
                    setModoManual(false);
                    setMatError(null);
                  }}
                >
                  ← Buscar en inventario
                </button>
              </div>
            )}
          </div>

          {/* Evidencia fotográfica */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Evidencia fotográfica</h2>
            <FotoUpload ordenId={id} tipo="antes" readOnly={false} />
            <div className={styles.fotosDivider} />
            <FotoUpload ordenId={id} tipo="despues" readOnly={false} />
          </div>

          {/* Observación */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Observación</h2>
            <textarea
              className={styles.textarea}
              placeholder="Notas del trabajo (opcional)…"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
            />
            <button
              className={styles.btnGuardarObs}
              onClick={guardarObservacion}
              disabled={savingObs}
            >
              {savingObs ? "Guardando…" : "Guardar nota"}
            </button>
          </div>

          {/* Firma del solicitante — inline, before sending to revision */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Firma del solicitante</h2>
            {firmaCapturada?.base64 ? (
              <div className={styles.firmaCapturadaWrap}>
                <img src={firmaCapturada.base64} alt="Firma" className={styles.firmaImg} />
                {firmaCapturada.nombre && (
                  <p className={styles.firmaNombre}>{firmaCapturada.nombre}</p>
                )}
                <button
                  type="button"
                  className={styles.btnCancelarFirma}
                  onClick={() => setFirmaCapturada(null)}
                >
                  Volver a firmar
                </button>
              </div>
            ) : (
              <FirmaCanvas
                onFirmar={(b64, nombre) => setFirmaCapturada({ base64: b64, nombre })}
                disabled={completing}
              />
            )}
          </div>

          {/* Enviar a revisión — locked until signed */}
          <div className={styles.actionSection}>
            <button
              className={`${styles.btnPrimary} ${styles.btnCompletar}`}
              onClick={() => setShowConfirmRevision(true)}
              disabled={completing || !firmaCapturada?.base64}
            >
              ✓ Enviar a revisión
            </button>
            {!firmaCapturada?.base64 && (
              <p className={styles.firmaRequerida}>Se requiere la firma antes de enviar.</p>
            )}
          </div>
        </>
      )}

      {/* ── EN REVISIÓN ── */}
      {orden.estado === "en_revision" && (
        <>
          <div className={styles.revisionBanner}>
            <span className={styles.revisionIcon}>⏳</span>
            <div>
              <p className={styles.revisionTitle}>Trabajo enviado a revisión</p>
              <p className={styles.revisionSub}>
                El jefe de mantención debe aprobar antes de cerrar la orden.
              </p>
            </div>
          </div>

          {orden.firma_solicitante && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Firma de conformidad</h2>
              <div className={styles.firmaView}>
                {orden.nombre_solicitante && (
                  <p className={styles.firmaNombre}>
                    {orden.nombre_solicitante}
                  </p>
                )}
                <img
                  src={orden.firma_solicitante}
                  alt="Firma"
                  className={styles.firmaImg}
                />
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Evidencia fotográfica</h2>
            <FotoUpload ordenId={id} tipo="antes" readOnly={false} />
            <div className={styles.fotosDivider} />
            <FotoUpload ordenId={id} tipo="despues" readOnly={false} />
          </div>

          {materiales.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Materiales</h2>
              <div className={styles.matListReadonly}>
                {materiales.map((m) => (
                  <div key={m.id} className={styles.matRowReadonly}>
                    <span className={styles.matNombre}>{m.nombre}</span>
                    <span className={styles.matCant}>
                      {m.cantidad} {m.unidad}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Observación</h2>
            <textarea
              className={styles.textarea}
              placeholder="Notas del trabajo (opcional)…"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
            />
            <button
              className={styles.btnGuardarObs}
              onClick={guardarObservacion}
              disabled={savingObs}
            >
              {savingObs ? "Guardando…" : "Guardar nota"}
            </button>
          </div>
        </>
      )}

      {/* ── COMPLETADO ── */}
      {orden.estado === "completado" && (
        <>
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

          {orden.firma_solicitante && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Firma de conformidad</h2>
              <div className={styles.firmaView}>
                {orden.nombre_solicitante && (
                  <p className={styles.firmaNombre}>
                    {orden.nombre_solicitante}
                  </p>
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

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Evidencia fotográfica</h2>
            <FotoUpload ordenId={id} tipo="antes" readOnly={true} />
            <div className={styles.fotosDivider} />
            <FotoUpload ordenId={id} tipo="despues" readOnly={true} />
          </div>

          {materiales.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Materiales</h2>
              <div className={styles.matListReadonly}>
                {materiales.map((m) => (
                  <div key={m.id} className={styles.matRowReadonly}>
                    <span className={styles.matNombre}>{m.nombre}</span>
                    <span className={styles.matCant}>
                      {m.cantidad} {m.unidad}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {orden.observacion && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Observación</h2>
              <p className={styles.obsText}>{orden.observacion}</p>
            </div>
          )}
        </>
      )}

      {/* ── Warning modal before revision ── */}
      {showConfirmRevision && (
        <div className={styles.confirmOverlay} onClick={() => setShowConfirmRevision(false)}>
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>¿Todo listo?</p>
            <p className={styles.confirmText}>
              Revisa que las fotos, materiales y observaciones estén completos antes de enviar.
              Una vez en revisión el jefe deberá aprobar el trabajo.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnConfirmNo}
                onClick={() => setShowConfirmRevision(false)}
              >
                Revisar trabajo
              </button>
              <button
                className={styles.btnConfirmSi}
                onClick={() => { setShowConfirmRevision(false); completarConFirma(); }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Real-time rejection popup ── */}
      {rechazoPopup && (
        <div className={styles.rechazoOverlay}>
          <div className={styles.rechazoModal}>
            <span className={styles.rechazoModalIcon}>❌</span>
            <p className={styles.rechazoModalTitle}>Trabajo rechazado</p>
            <p className={styles.rechazoModalMotivo}>{rechazoPopup}</p>
            <button
              className={styles.btnConfirmSi}
              onClick={() => setRechazoPopup(null)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
