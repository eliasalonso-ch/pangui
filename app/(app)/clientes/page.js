"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Plus, Pencil, Building2, Phone, Mail, X, Check } from "lucide-react";
import styles from "./page.module.css";

const EMPTY = {
  nombre: "", rut: "", giro: "", direccion: "", comuna: "", ciudad: "",
  contacto_nombre: "", contacto_email: "", contacto_telefono: "", notas: "",
};

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes]   = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [plantaId, setPlantaId]   = useState(null);

  // form state
  const [showForm, setShowForm]   = useState(false);
  const [editId,   setEditId]     = useState(null); // null = create
  const [form,     setForm]       = useState(EMPTY);
  const [saving,   setSaving]     = useState(false);
  const [formErr,  setFormErr]    = useState(null);

  // ── Load ──────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: perfil } = await supabase
      .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
    if (!perfil || !["jefe", "admin"].includes(perfil.rol)) {
      router.push("/tecnico"); return;
    }
    setPlantaId(perfil.workspace_id);

    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("workspace_id", perfil.workspace_id)
      .eq("activo", true)
      .order("nombre");
    setClientes(data ?? []);
    setCargando(false);
  }, [router]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Form helpers ──────────────────────────────────────────────
  function abrirNuevo() {
    setEditId(null);
    setForm(EMPTY);
    setFormErr(null);
    setShowForm(true);
  }

  function abrirEditar(c) {
    setEditId(c.id);
    setForm({
      nombre: c.nombre ?? "", rut: c.rut ?? "", giro: c.giro ?? "",
      direccion: c.direccion ?? "", comuna: c.comuna ?? "", ciudad: c.ciudad ?? "",
      contacto_nombre: c.contacto_nombre ?? "", contacto_email: c.contacto_email ?? "",
      contacto_telefono: c.contacto_telefono ?? "", notas: c.notas ?? "",
    });
    setFormErr(null);
    setShowForm(true);
  }

  function setF(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar() {
    if (!form.nombre.trim()) { setFormErr("El nombre es obligatorio."); return; }
    setSaving(true);
    setFormErr(null);
    const supabase = createClient();
    const payload = {
      nombre: form.nombre.trim(), rut: form.rut.trim() || null,
      giro: form.giro.trim() || null, direccion: form.direccion.trim() || null,
      comuna: form.comuna.trim() || null, ciudad: form.ciudad.trim() || null,
      contacto_nombre: form.contacto_nombre.trim() || null,
      contacto_email: form.contacto_email.trim() || null,
      contacto_telefono: form.contacto_telefono.trim() || null,
      notas: form.notas.trim() || null,
    };

    if (editId) {
      await supabase.from("clientes").update(payload).eq("id", editId);
    } else {
      await supabase.from("clientes").insert({ ...payload, workspace_id: plantaId });
    }

    setSaving(false);
    setShowForm(false);
    cargar();
  }

  async function archivar(id) {
    if (!confirm("¿Archivar este cliente?")) return;
    const supabase = createClient();
    await supabase.from("clientes").update({ activo: false }).eq("id", id);
    cargar();
  }

  if (cargando) return <main className={styles.page}><p className={styles.loading}>Cargando clientes…</p></main>;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Clientes</h1>
        <button className={styles.btnNuevo} onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {clientes.length === 0 ? (
        <div className={styles.empty}>
          <Building2 size={40} className={styles.emptyIcon} />
          <p>No hay clientes registrados.</p>
          <button className={styles.btnNuevo} onClick={abrirNuevo}>
            <Plus size={14} /> Agregar primero
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {clientes.map((c) => (
            <li key={c.id} className={styles.card}>
              <div className={styles.cardMain}>
                <p className={styles.cardNombre}>{c.nombre}</p>
                {c.rut && <p className={styles.cardRut}>{c.rut}</p>}
                {c.giro && <p className={styles.cardGiro}>{c.giro}</p>}
                <div className={styles.cardContact}>
                  {c.contacto_telefono && (
                    <span><Phone size={12} /> {c.contacto_telefono}</span>
                  )}
                  {c.contacto_email && (
                    <span><Mail size={12} /> {c.contacto_email}</span>
                  )}
                </div>
                {c.direccion && (
                  <p className={styles.cardDir}>{[c.direccion, c.comuna, c.ciudad].filter(Boolean).join(", ")}</p>
                )}
              </div>
              <div className={styles.cardActions}>
                <button className={styles.btnEdit} onClick={() => abrirEditar(c)} title="Editar">
                  <Pencil size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Form modal ── */}
      {showForm && (
        <div className={styles.overlay} onClick={() => !saving && setShowForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editId ? "Editar cliente" : "Nuevo cliente"}</h2>
              <button className={styles.btnClose} onClick={() => setShowForm(false)} disabled={saving}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Nombre / Institución *</label>
                <input className={styles.input} value={form.nombre}
                  onChange={(e) => setF("nombre", e.target.value)} placeholder="Ej. Universidad de Concepción" />
              </div>
              <div>
                <label className={styles.label}>RUT</label>
                <input className={styles.input} value={form.rut}
                  onChange={(e) => setF("rut", e.target.value)} placeholder="12.345.678-9" />
              </div>
              <div>
                <label className={styles.label}>Giro</label>
                <input className={styles.input} value={form.giro}
                  onChange={(e) => setF("giro", e.target.value)} placeholder="Educación superior" />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Dirección</label>
                <input className={styles.input} value={form.direccion}
                  onChange={(e) => setF("direccion", e.target.value)} placeholder="Av. Universidad 000" />
              </div>
              <div>
                <label className={styles.label}>Comuna</label>
                <input className={styles.input} value={form.comuna}
                  onChange={(e) => setF("comuna", e.target.value)} placeholder="Concepción" />
              </div>
              <div>
                <label className={styles.label}>Ciudad</label>
                <input className={styles.input} value={form.ciudad}
                  onChange={(e) => setF("ciudad", e.target.value)} placeholder="Concepción" />
              </div>

              <div className={`${styles.fieldFull} ${styles.sectionLabel}`}>Contacto</div>

              <div className={styles.fieldFull}>
                <label className={styles.label}>Nombre contacto</label>
                <input className={styles.input} value={form.contacto_nombre}
                  onChange={(e) => setF("contacto_nombre", e.target.value)} placeholder="María González" />
              </div>
              <div>
                <label className={styles.label}>Email</label>
                <input className={styles.input} type="email" value={form.contacto_email}
                  onChange={(e) => setF("contacto_email", e.target.value)} placeholder="contacto@uni.cl" />
              </div>
              <div>
                <label className={styles.label}>Teléfono</label>
                <input className={styles.input} value={form.contacto_telefono}
                  onChange={(e) => setF("contacto_telefono", e.target.value)} placeholder="+56 9 1234 5678" />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Notas internas</label>
                <textarea className={styles.textarea} rows={3} value={form.notas}
                  onChange={(e) => setF("notas", e.target.value)} placeholder="Contratos vigentes, condiciones especiales…" />
              </div>
            </div>

            {formErr && <p className={styles.formErr}>{formErr}</p>}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setShowForm(false)} disabled={saving}>
                Cancelar
              </button>
              <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
                {saving ? "Guardando…" : <><Check size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
