"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import { callEdge } from "@/lib/edge";
import styles from "./page.module.css";

export default function JefeNuevaOrdenPage() {
  const router = useRouter();
  const [plantaId, setPlantaId]       = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [tecnicos, setTecnicos]       = useState([]);
  const [clientes, setClientes]       = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const [form, setForm] = useState({
    tipo:             "solicitud",
    numero_meconecta: "",
    cliente_id:       "",
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

      if (!perfil || perfil.rol !== "jefe") { router.push("/login"); return; }

      const pId = perfil.planta_id;
      setPlantaId(pId);

      const [{ data: ubics }, { data: tecns }, { data: clis }] = await Promise.all([
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
        supabase
          .from("clientes")
          .select("id, nombre, rut")
          .eq("planta_id", pId)
          .eq("activo", true)
          .order("nombre"),
      ]);

      setUbicaciones(ubics ?? []);
      setTecnicos(tecns ?? []);
      setClientes(clis ?? []);
      setCargando(false);
    }
    init();
  }, [router]);

  async function guardar() {
    if (!form.ubicacion_id)       { setError("Selecciona una ubicación."); return; }
    if (!form.descripcion.trim()) { setError("Ingresa una descripción."); return; }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const now = new Date().toISOString();

    const { data: nuevaOrden, error: insError } = await supabase
      .from("ordenes_trabajo")
      .insert({
        planta_id:        plantaId,
        tecnico_id:       form.tecnico_id || null,
        cliente_id:       form.cliente_id || null,
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
      })
      .select("id")
      .single();

    if (insError) { setError(insError.message); setSaving(false); return; }

    const desc = form.descripcion.trim().slice(0, 60);
    const ordenUrl = `/tecnico/trabajo/${nuevaOrden.id}`;

    if (form.tipo === "emergencia") {
      // Notify ALL technicians in the plant
      callEdge("notificar", {
        planta_id_todos_tecnicos: plantaId,
        titulo: "🚨 EMERGENCIA",
        mensaje: desc,
        url: ordenUrl,
        urgente: true,
      });
    } else if (form.tecnico_id) {
      // Notify only the assigned technician
      callEdge("notificar", {
        usuario_id: form.tecnico_id,
        titulo: "Nueva orden asignada",
        mensaje: desc,
        url: ordenUrl,
      });
    }

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

      {/* Cliente */}
      <div className={styles.section}>
        <label className={styles.label}>Cliente / Institución</label>
        {clientes.length === 0 ? (
          <p className={styles.empty}>
            No hay clientes.{" "}
            <a href="/jefe/clientes" className={styles.link}>Agregar cliente</a>
          </p>
        ) : (
          <select
            className={styles.select}
            value={form.cliente_id}
            onChange={(e) => set("cliente_id", e.target.value)}
          >
            <option value="">Sin cliente asignado</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.rut ? ` · ${c.rut}` : ""}
              </option>
            ))}
          </select>
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
        <label className={styles.label}>Asignar a técnico</label>
        {tecnicos.length === 0 ? (
          <p className={styles.empty}>No hay técnicos en la planta.</p>
        ) : (
          <select
            className={styles.select}
            value={form.tecnico_id}
            onChange={(e) => set("tecnico_id", e.target.value)}
          >
            <option value="">Sin asignar (asignar después)</option>
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
