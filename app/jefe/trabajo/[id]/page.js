"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import { callEdge } from "@/lib/edge";
import dynamic from "next/dynamic";
const FotoUpload = dynamic(() => import("@/components/FotoUpload"), { ssr: false, loading: () => null });
import styles from "./page.module.css";
import { Pencil, Ban, Trash2 } from "lucide-react";

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

  // reject (en_revision → en_curso)
  const [showRechazar,  setShowRechazar]  = useState(false);
  const [rechazoInput,  setRechazoInput]  = useState("");
  const [rechazando,    setRechazando]    = useState(false);

  // billing
  const [billing, setBilling] = useState({
    estado_cobro: "no_cobrable", numero_factura: "", fecha_cobro: "", costo_mano_obra: "",
    rut_cliente: "", nombre_cliente: "", giro_cliente: "", direccion_cliente: "",
    email_cliente: "", comuna_cliente: "", ciudad_cliente: "", aplica_iva: false,
  });
  const [billingMats, setBillingMats] = useState([]); // materiales with editable precio_unitario
  const [savingBilling, setSavingBilling] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [emitError, setEmitError] = useState(null);
  const [emitOk, setEmitOk] = useState(null);

  // delete
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const cargarOrden = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(
        "*, " +
          "tecnicos:usuarios(nombre), " +
          "ubicaciones(edificio, piso, detalle), " +
          "clientes(id, nombre, rut, giro, direccion, comuna, ciudad, contacto_nombre, contacto_email, contacto_telefono)",
      )
      .eq("id", id)
      .maybeSingle();
    if (data) {
      setOrden(data);
      // Auto-fill billing from linked client if fields are empty
      const cli = data.clientes;
      setBilling({
        estado_cobro:     data.estado_cobro    ?? "no_cobrable",
        numero_factura:   data.numero_factura  ?? "",
        fecha_cobro:      data.fecha_cobro ? data.fecha_cobro.slice(0, 10) : "",
        costo_mano_obra:  data.costo_mano_obra != null ? String(data.costo_mano_obra) : "",
        rut_cliente:       data.rut_cliente       || cli?.rut         || "",
        nombre_cliente:    data.nombre_cliente    || cli?.nombre      || "",
        giro_cliente:      data.giro_cliente      || cli?.giro        || "",
        direccion_cliente: data.direccion_cliente || cli?.direccion   || "",
        email_cliente:     data.email_cliente     || cli?.contacto_email || "",
        comuna_cliente:    data.comuna_cliente    || cli?.comuna      || "",
        ciudad_cliente:    data.ciudad_cliente    || cli?.ciudad      || "",
        aplica_iva:        data.aplica_iva         ?? false,
        folio_dte:         data.folio_dte          ?? null,
        tipo_dte:          data.tipo_dte           ?? null,
      });
    }
  }, [id]);

  const cargarMateriales = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("materiales_usados")
      .select("*, materiales(precio_unitario)")
      .eq("orden_id", id)
      .order("created_at");
    if (data) {
      setMateriales(data);
      setBillingMats(data.map((m) => ({
        ...m,
        precio_unitario: m.precio_unitario ?? m.materiales?.precio_unitario ?? 0,
      })));
    }
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

      let perfil = getPerfilCache(user.id);
      if (!perfil) {
        const { data } = await supabase
          .from("usuarios")
          .select("planta_id, rol, nombre")
          .eq("id", user.id)
          .maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }
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

  // ── Global refresh event ────────────────────────────────────

  useEffect(() => {
    const handler = () => { cargarOrden(); cargarMateriales(); };
    window.addEventListener("pangui:refresh", handler);
    return () => window.removeEventListener("pangui:refresh", handler);
  }, [cargarOrden, cargarMateriales]);

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
    // Notify assigned technician of the edit
    const tecnicoId = patch.tecnico_id || orden?.tecnico_id;
    if (tecnicoId) {
      callEdge("notificar", {
        usuario_id: tecnicoId,
        titulo: "Orden actualizada",
        mensaje: patch.descripcion?.slice(0, 60) ?? "",
        url: `/tecnico/trabajo/${id}`,
      });
    }
    await cargarOrden();
    setSavingEdit(false);
    setEditMode(false);
  }

  async function rechazarOrden() {
    if (!rechazoInput.trim()) return;
    setRechazando(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ estado: "en_curso", rechazo_motivo: rechazoInput.trim() })
      .eq("id", id);
    if (orden?.tecnico_id) {
      callEdge("notificar", {
        usuario_id: orden.tecnico_id,
        titulo: "❌ Trabajo rechazado",
        mensaje: rechazoInput.trim().slice(0, 80),
        url: `/tecnico/trabajo/${id}`,
      });
    }
    setRechazando(false);
    setShowRechazar(false);
    setRechazoInput("");
    await cargarOrden();
  }

  async function aprobarOrden() {
    setAprobando(true);
    const supabase = createClient();
    await supabase
      .from("ordenes_trabajo")
      .update({ estado: "completado" })
      .eq("id", id);
    if (orden?.tecnico_id) {
      callEdge("notificar", {
        usuario_id: orden.tecnico_id,
        titulo: "✅ Trabajo aprobado",
        mensaje: orden.descripcion?.slice(0, 60) ?? "",
        url: `/tecnico/trabajo/${id}`,
      });
    }
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

    if (orden?.tecnico_id) {
      callEdge("notificar", {
        usuario_id: orden.tecnico_id,
        titulo: "Orden cancelada",
        mensaje: orden.descripcion?.slice(0, 50) ?? "",
        url: `/tecnico/trabajo/${id}`,
      });
    }

    await cargarOrden();
    setCancelando(false);
    setConfirmCancelar(false);
  }

  async function guardarBilling() {
    setSavingBilling(true);
    const supabase = createClient();

    // Save per-material unit prices
    await Promise.all(
      billingMats.map((m) =>
        supabase.from("materiales_usados")
          .update({ precio_unitario: parseFloat(m.precio_unitario) || 0 })
          .eq("id", m.id)
      )
    );

    // Recalculate costo_materiales from billing mats
    const costoMats = billingMats.reduce(
      (s, m) => s + (m.cantidad || 0) * (parseFloat(m.precio_unitario) || 0), 0
    );
    const costoManoObra = billing.costo_mano_obra !== "" ? parseFloat(billing.costo_mano_obra) : 0;
    const neto = costoMats + costoManoObra;
    const iva = billing.aplica_iva ? Math.round(neto * 0.19) : 0;

    const patch = {
      estado_cobro:      billing.estado_cobro,
      numero_factura:    billing.numero_factura.trim() || null,
      fecha_cobro:       billing.fecha_cobro || null,
      costo_mano_obra:   costoManoObra,
      costo_materiales:  costoMats,
      costo_total:       neto + iva,
      rut_cliente:       billing.rut_cliente.trim()       || null,
      nombre_cliente:    billing.nombre_cliente.trim()    || null,
      giro_cliente:      billing.giro_cliente.trim()      || null,
      direccion_cliente: billing.direccion_cliente.trim() || null,
      email_cliente:     billing.email_cliente?.trim()    || null,
      comuna_cliente:    billing.comuna_cliente?.trim()   || null,
      ciudad_cliente:    billing.ciudad_cliente?.trim()   || null,
      aplica_iva:        billing.aplica_iva,
    };
    await supabase.from("ordenes_trabajo").update(patch).eq("id", id);
    await cargarOrden();
    setSavingBilling(false);
  }

  async function emitirDTE() {
    setEmitError(null);
    setEmitOk(null);
    setEmitiendo(true);

    // Save billing first to ensure DB is up to date
    await guardarBilling();

    const res = await fetch("/api/simplefactura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing, billingMats }),
    });

    const body = await res.json();
    setEmitiendo(false);

    if (!res.ok) {
      setEmitError(body.error ?? "Error al emitir DTE.");
      return;
    }

    // Save folio + tipo_dte back to the order and mark as cobrado
    const supabase = createClient();
    await supabase.from("ordenes_trabajo").update({
      folio_dte:      body.folio,
      tipo_dte:       body.tipoDTE,
      numero_factura: String(body.folio),
      estado_cobro:   "cobrado",
    }).eq("id", id);

    setBilling((b) => ({ ...b, numero_factura: String(body.folio), estado_cobro: "cobrado" }));
    setEmitOk({ folio: body.folio, tipoDTE: body.tipoDTE, message: body.message });
    await cargarOrden();
  }

  async function eliminarOrden() {
    setEliminando(true);
    const supabase = createClient();
    const { error } = await supabase.from("ordenes_trabajo").delete().eq("id", id);
    if (error) {
      alert("No se pudo eliminar la orden. Intenta de nuevo.");
      setEliminando(false);
      return;
    }
    router.push("/jefe");
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
      <div className={styles.volverRow}>
        <button className={styles.btnVolver} onClick={() => router.push("/jefe")}>
          ← Volver al panel
        </button>
      </div>

      {/* ── Jefe actions bar ── */}
      {!editMode && (
        <div className={styles.iconActionsRow}>
          <button
            className={styles.iconBtn}
            onClick={abrirEdicion}
            disabled={cancelada}
            title="Editar"
          >
            <Pencil size={20} />
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnWarn}`}
            onClick={() => setConfirmCancelar(true)}
            disabled={cancelada}
            title="Cancelar orden"
          >
            <Ban size={20} />
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            onClick={() => setConfirmEliminar(true)}
            title="Eliminar orden"
          >
            <Trash2 size={20} />
          </button>
        </div>
      )}

      {/* Aprobar / Rechazar — when en_revision */}
      {!editMode && !cancelada && orden.estado === "en_revision" && (
        <div className={styles.revisionActions}>
          <button
            className={styles.btnAprobar}
            onClick={aprobarOrden}
            disabled={aprobando || rechazando}
          >
            {aprobando ? "Aprobando…" : "✓ Aprobar"}
          </button>
          <button
            className={styles.btnRechazar}
            onClick={() => setShowRechazar(true)}
            disabled={aprobando || rechazando}
          >
            ✗ Rechazar
          </button>
        </div>
      )}

      {/* Rejection modal */}
      {showRechazar && (
        <div className={styles.confirmOverlay} onClick={() => !rechazando && setShowRechazar(false)}>
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>Rechazar trabajo</p>
            <p className={styles.confirmText}>
              Indica el motivo para que el técnico pueda corregirlo.
            </p>
            <textarea
              className={styles.rechazoTextarea}
              placeholder="Motivo del rechazo…"
              value={rechazoInput}
              onChange={(e) => setRechazoInput(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className={styles.confirmActions}>
              <button
                className={styles.btnConfirmNo}
                onClick={() => { setShowRechazar(false); setRechazoInput(""); }}
                disabled={rechazando}
              >
                Cancelar
              </button>
              <button
                className={styles.btnRechazarConfirm}
                onClick={rechazarOrden}
                disabled={rechazando || !rechazoInput.trim()}
              >
                {rechazando ? "Rechazando…" : "Rechazar"}
              </button>
            </div>
          </div>
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
              <div className={styles.cardTopBadges}>
                <span className={`${styles.badge} ${BADGE_CLASS[orden.estado] ?? ""}`}>
                  {BADGE_LABEL[orden.estado] ?? orden.estado}
                </span>
                {orden.estado_cobro && orden.estado_cobro !== "no_cobrable" && (
                  <span className={`${styles.badge} ${styles["badgeCobro_" + orden.estado_cobro]}`}>
                    {orden.estado_cobro === "pendiente_cobro" ? "Pendiente cobro" : "Cobrado"}
                  </span>
                )}
              </div>
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
            {/* Client badge */}
            {orden.clientes && (
              <p className={styles.clienteBadge}>
                🏢 {orden.clientes.nombre}
                {orden.clientes.rut ? ` · ${orden.clientes.rut}` : ""}
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

      {/* ── Facturación ── */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Facturación</h2>

        {/* Cliente */}
        <div className={styles.invoiceBlock}>
          <p className={styles.invoiceBlockTitle}>Datos del cliente</p>
          <div className={styles.invoiceGrid}>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>RUT cliente</label>
              <input className={styles.billingInput} placeholder="12.345.678-9"
                value={billing.rut_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, rut_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Razón social</label>
              <input className={styles.billingInput} placeholder="Empresa S.A."
                value={billing.nombre_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, nombre_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Giro</label>
              <input className={styles.billingInput} placeholder="Mantención industrial"
                value={billing.giro_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, giro_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Dirección</label>
              <input className={styles.billingInput} placeholder="Av. Principal 123"
                value={billing.direccion_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, direccion_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Comuna</label>
              <input className={styles.billingInput} placeholder="Santiago"
                value={billing.comuna_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, comuna_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Ciudad</label>
              <input className={styles.billingInput} placeholder="Santiago"
                value={billing.ciudad_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, ciudad_cliente: e.target.value }))} />
            </div>
            <div className={styles.invoiceField}>
              <label className={styles.billingLabel}>Email cliente</label>
              <input className={styles.billingInput} type="email" placeholder="contacto@empresa.cl"
                value={billing.email_cliente}
                onChange={(e) => setBilling((b) => ({ ...b, email_cliente: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className={styles.invoiceBlock}>
          <p className={styles.invoiceBlockTitle}>Detalle de servicios</p>

          {billingMats.length > 0 && (
            <div className={styles.invoiceTable}>
              <div className={styles.invoiceTableHead}>
                <span>Ítem</span>
                <span>Cant.</span>
                <span>P. Unit.</span>
                <span>Total</span>
              </div>
              {billingMats.map((m, i) => {
                const total = (m.cantidad || 0) * (parseFloat(m.precio_unitario) || 0);
                return (
                  <div key={m.id} className={styles.invoiceTableRow}>
                    <span className={styles.invoiceItemName}>{m.nombre}</span>
                    <span>{m.cantidad} {m.unidad}</span>
                    <input
                      className={styles.invoicePriceInput}
                      type="number"
                      min="0"
                      placeholder="0"
                      value={m.precio_unitario || ""}
                      onChange={(e) => {
                        const updated = [...billingMats];
                        updated[i] = { ...m, precio_unitario: e.target.value };
                        setBillingMats(updated);
                      }}
                    />
                    <span>${total.toLocaleString("es-CL")}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mano de obra row */}
          <div className={styles.invoiceTable}>
            <div className={styles.invoiceTableRow}>
              <span className={styles.invoiceItemName}>Mano de obra</span>
              <span>—</span>
              <span>—</span>
              <input
                className={styles.invoicePriceInput}
                type="number"
                min="0"
                placeholder="0"
                value={billing.costo_mano_obra}
                onChange={(e) => setBilling((b) => ({ ...b, costo_mano_obra: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Totals */}
        {(() => {
          const costoMats = billingMats.reduce(
            (s, m) => s + (m.cantidad || 0) * (parseFloat(m.precio_unitario) || 0), 0
          );
          const manoObra = parseFloat(billing.costo_mano_obra) || 0;
          const neto = costoMats + manoObra;
          const iva = billing.aplica_iva ? Math.round(neto * 0.19) : 0;
          const total = neto + iva;
          return (
            <div className={styles.invoiceTotals}>
              <div className={styles.invoiceTotalRow}>
                <span>Neto</span>
                <span>${neto.toLocaleString("es-CL")}</span>
              </div>
              <div className={styles.invoiceTotalRow}>
                <label className={styles.invoiceIvaLabel}>
                  <input type="checkbox" checked={billing.aplica_iva}
                    onChange={(e) => setBilling((b) => ({ ...b, aplica_iva: e.target.checked }))} />
                  IVA 19%
                </label>
                <span>${iva.toLocaleString("es-CL")}</span>
              </div>
              <div className={`${styles.invoiceTotalRow} ${styles.invoiceTotalFinal}`}>
                <span>TOTAL</span>
                <span>${total.toLocaleString("es-CL")}</span>
              </div>
            </div>
          );
        })()}

        {/* Cobro metadata */}
        <div className={styles.invoiceBlock}>
          <p className={styles.invoiceBlockTitle}>Estado de cobro</p>
          <select className={styles.billingSelect} value={billing.estado_cobro}
            onChange={(e) => setBilling((b) => ({ ...b, estado_cobro: e.target.value }))}>
            <option value="no_cobrable">No cobrable</option>
            <option value="pendiente_cobro">Pendiente cobro</option>
            <option value="cobrado">Cobrado</option>
          </select>

          {billing.estado_cobro !== "no_cobrable" && (
            <>
              <label className={styles.billingLabel}>N° de factura</label>
              <input className={styles.billingInput} placeholder="FAC-2024-001"
                value={billing.numero_factura}
                onChange={(e) => setBilling((b) => ({ ...b, numero_factura: e.target.value }))} />
            </>
          )}
          {billing.estado_cobro === "cobrado" && (
            <>
              <label className={styles.billingLabel}>Fecha de cobro</label>
              <input className={styles.billingInput} type="date"
                value={billing.fecha_cobro}
                onChange={(e) => setBilling((b) => ({ ...b, fecha_cobro: e.target.value }))} />
            </>
          )}
        </div>

        {/* DTE emission */}
        {billing.estado_cobro !== "no_cobrable" && (
          <div className={styles.dteBlock}>
            {billing.folio_dte ? (
              <div className={styles.dteEmitido}>
                <span className={styles.dteEmitidoLabel}>DTE emitido</span>
                <span className={styles.dteEmitidoFolio}>
                  Folio {billing.folio_dte} · Tipo {billing.tipo_dte === 33 ? "Factura Afecta" : "Factura Exenta"}
                </span>
                <div className={styles.dteDownloads}>
                  <a
                    href={`/api/simplefactura/download?folio=${billing.folio_dte}&tipo=${billing.tipo_dte ?? 33}&format=pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnDownloadDTE}
                  >
                    Descargar PDF
                  </a>
                  <a
                    href={`/api/simplefactura/download?folio=${billing.folio_dte}&tipo=${billing.tipo_dte ?? 33}&format=xml`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnDownloadDTE}
                  >
                    Descargar XML
                  </a>
                </div>
              </div>
            ) : (
              <>
                {emitError && <p className={styles.dteError}>{emitError}</p>}
                {emitOk && (
                  <p className={styles.dteSuccess}>
                    ✓ DTE emitido — Folio {emitOk.folio}
                  </p>
                )}
                <button
                  className={styles.btnEmitirDTE}
                  onClick={emitirDTE}
                  disabled={emitiendo || savingBilling}
                >
                  {emitiendo ? "Emitiendo DTE…" : "Emitir factura electrónica"}
                </button>
              </>
            )}
          </div>
        )}

        <button className={styles.btnBillingSave} onClick={guardarBilling} disabled={savingBilling}>
          {savingBilling ? "Guardando…" : "Guardar facturación"}
        </button>
      </div>

      {/* ── Confirm eliminar overlay ── */}
      {confirmEliminar && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmEliminar(false)}>
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmText}>
              ¿Eliminar esta orden permanentemente? Esta acción no se puede deshacer.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.btnConfirmNo} onClick={() => setConfirmEliminar(false)} disabled={eliminando}>
                Volver
              </button>
              <button className={styles.btnConfirmSi} onClick={eliminarOrden} disabled={eliminando}>
                {eliminando ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
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
