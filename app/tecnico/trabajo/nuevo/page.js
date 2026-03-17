"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

export default function NuevaOrdenPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [plantaId, setPlantaId] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    tipo: "solicitud",
    numero_meconecta: "",
    ubicacion_id: "",
    descripcion: "",
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

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
        .select("planta_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!perfil) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setPlantaId(perfil.planta_id);

      const { data: ubics } = await supabase
        .from("ubicaciones")
        .select("id, edificio, piso, detalle")
        .eq("planta_id", perfil.planta_id)
        .eq("activa", true)
        .order("edificio");

      setUbicaciones(ubics ?? []);
      setCargando(false);
    }
    init();
  }, [router]);

  async function guardar() {
    if (!form.ubicacion_id) {
      setError("Selecciona una ubicación.");
      return;
    }
    if (!form.descripcion.trim()) {
      setError("Ingresa una descripción del trabajo.");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error: insError } = await supabase.from("ordenes_trabajo").insert({
      planta_id: plantaId,
      tecnico_id: userId,
      ubicacion_id: form.ubicacion_id,
      tipo: form.tipo,
      numero_meconecta:
        form.tipo === "solicitud" && form.numero_meconecta.trim()
          ? form.numero_meconecta.trim()
          : null,
      descripcion: form.descripcion.trim(),
      estado: form.tipo === "emergencia" ? "en_curso" : "pendiente",
      prioridad: form.tipo === "emergencia" ? "urgente" : "normal",
      hora_inicio: now,
    });

    if (insError) {
      setError(insError.message);
      setSaving(false);
      return;
    }

    router.push("/tecnico");
  }

  if (cargando) {
    return <p className={styles.loading}>Cargando…</p>;
  }

  return (
    <main className={styles.main}>
        {/* Tipo */}
        <div className={styles.section}>
          <label className={styles.label}>Tipo de orden</label>
          <div className={styles.toggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${
                form.tipo === "solicitud" ? styles.toggleSolicitud : ""
              }`}
              onClick={() => set("tipo", "solicitud")}
            >
              Solicitud
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${
                form.tipo === "emergencia" ? styles.toggleEmergencia : ""
              }`}
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
            <p style={{ color: "var(--accent-6)", fontSize: "var(--fs-sm)" }}>
              No hay ubicaciones disponibles.
            </p>
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
            onClick={() => router.push("/tecnico")}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btnPrimary} ${
              form.tipo === "emergencia" ? styles.btnEmergencia : ""
            }`}
            onClick={guardar}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Crear orden"}
          </button>
        </div>
      </main>
  );
}
