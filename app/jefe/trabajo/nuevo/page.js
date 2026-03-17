"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

export default function JefeNuevaOrdenPage() {
  const router = useRouter();
  const [plantaId, setPlantaId]       = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [tecnicos, setTecnicos]       = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const [form, setForm] = useState({
    tipo:             "solicitud",
    numero_meconecta: "",
    ubicacion_id:     "",
    descripcion:      "",
    tecnico_id:       "",
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id, rol")
        .eq("id", user.id)
        .maybeSingle();

      if (!perfil || perfil.rol !== "jefe") { router.push("/login"); return; }

      const pId = perfil.planta_id;
      setPlantaId(pId);

      const [{ data: ubics }, { data: tecns }] = await Promise.all([
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
  }, [router]);

  async function guardar() {
    if (!form.ubicacion_id)       { setError("Selecciona una ubicación."); return; }
    if (!form.descripcion.trim()) { setError("Ingresa una descripción."); return; }
    if (!form.tecnico_id)         { setError("Asigna un técnico."); return; }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error: insError } = await supabase.from("ordenes_trabajo").insert({
      planta_id:        plantaId,
      tecnico_id:       form.tecnico_id,
      ubicacion_id:     form.ubicacion_id,
      tipo:             form.tipo,
      numero_meconecta:
        form.tipo === "solicitud" && form.numero_meconecta.trim()
          ? form.numero_meconecta.trim()
          : null,
      descripcion:      form.descripcion.trim(),
      estado:           form.tipo === "emergencia" ? "en_curso" : "pendiente",
      prioridad:        form.tipo === "emergencia" ? "urgente" : "normal",
      hora_inicio:      form.tipo === "emergencia" ? now : null,
    });

    if (insError) { setError(insError.message); setSaving(false); return; }

    router.push("/jefe");
  }

  if (cargando) {
    return <p className={styles.loading}>Cargando…</p>;
  }

  return (
    <main className={styles.main}>
      <button className={styles.btnVolver} onClick={() => router.push("/jefe")}>
        ← Volver al panel
      </button>

      <h1 className={styles.titulo}>Nueva orden de trabajo</h1>

      {/* Tipo */}
      <div className={styles.section}>
        <label className={styles.label}>Tipo de orden</label>
        <div className={styles.toggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${form.tipo === "solicitud" ? styles.toggleSolicitud : ""}`}
            onClick={() => set("tipo", "solicitud")}
          >
            Solicitud
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${form.tipo === "emergencia" ? styles.toggleEmergencia : ""}`}
            onClick={() => set("tipo", "emergencia")}
          >
            🚨 Emergencia
          </button>
        </div>
        {form.tipo === "emergencia" && (
          <p className={styles.emergenciaNotice}>
            La orden se creará directamente en estado <strong>En curso</strong>.
          </p>
        )}
      </div>

      {/* N° Me Conecta — solo solicitud */}
      {form.tipo === "solicitud" && (
        <div className={styles.section}>
          <label className={styles.label}>N° Me Conecta</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Opcional"
            value={form.numero_meconecta}
            onChange={(e) => set("numero_meconecta", e.target.value)}
          />
        </div>
      )}

      {/* Ubicación */}
      <div className={styles.section}>
        <label className={styles.label}>Ubicación</label>
        {ubicaciones.length === 0 ? (
          <p className={styles.empty}>No hay ubicaciones disponibles.</p>
        ) : (
          <select
            className={styles.select}
            value={form.ubicacion_id}
            onChange={(e) => set("ubicacion_id", e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.edificio}
                {u.piso ? ` · Piso ${u.piso}` : ""}
                {u.detalle ? ` · ${u.detalle}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Asignar técnico */}
      <div className={styles.section}>
        <label className={styles.label}>Asignar a</label>
        {tecnicos.length === 0 ? (
          <p className={styles.empty}>No hay técnicos en la planta.</p>
        ) : (
          <select
            className={styles.select}
            value={form.tecnico_id}
            onChange={(e) => set("tecnico_id", e.target.value)}
          >
            <option value="">Seleccionar técnico…</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* Descripción */}
      <div className={styles.section}>
        <label className={styles.label}>Descripción</label>
        <textarea
          className={styles.textarea}
          placeholder="Describe el trabajo a realizar…"
          value={form.descripcion}
          onChange={(e) => set("descripcion", e.target.value)}
          rows={4}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => router.push("/jefe")}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={`${styles.btnPrimary} ${form.tipo === "emergencia" ? styles.btnEmergencia : ""}`}
          onClick={guardar}
          disabled={saving}
        >
          {saving ? "Guardando…" : "Crear orden"}
        </button>
      </div>
    </main>
  );
}
