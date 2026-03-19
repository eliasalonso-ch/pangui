"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import styles from "./page.module.css";

const ESTADO_COLOR = {
  pendiente:   "#6b7280",
  en_curso:    "#f59e0b",
  en_revision: "#6366f1",
  completado:  "#22c55e",
  cancelado:   "#ef4444",
};

const ESTADO_LABEL = {
  pendiente:   "Pendiente",
  en_curso:    "En curso",
  en_revision: "En revisión",
  completado:  "Completado",
  cancelado:   "Cancelado",
};

function formatId(o) {
  const year = new Date(o.created_at).getFullYear();
  const suffix = o.id.slice(-4).toUpperCase();
  return `${o.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function CalendarioPage() {
  const router = useRouter();
  const today  = new Date();

  const [plantaId,  setPlantaId]  = useState(null);
  const [tecnicos,  setTecnicos]  = useState([]);
  const [ordenes,   setOrdenes]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [selectedDay,   setSelectedDay]   = useState(null); // Date obj

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      let perfil = getPerfilCache(user.id);
      if (!perfil) {
        const { data } = await supabase.from("usuarios").select("planta_id, rol, nombre").eq("id", user.id).maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }
      if (!perfil?.planta_id) return;
      setPlantaId(perfil.planta_id);

      const [{ data: ords }, { data: tecns }] = await Promise.all([
        supabase
          .from("ordenes_trabajo")
          .select("id, tipo, estado, created_at, tecnico_id, descripcion, tecnicos:usuarios(nombre)")
          .eq("planta_id", perfil.planta_id)
          .order("created_at", { ascending: false }),
        supabase.from("usuarios").select("id, nombre").eq("planta_id", perfil.planta_id).eq("rol", "tecnico").order("nombre"),
      ]);

      setOrdenes(ords ?? []);
      setTecnicos(tecns ?? []);
      setLoading(false);
    }
    init();
  }, [router]);

  // Filter + group by day
  const ordenesFiltradas = useMemo(() => {
    if (!filtroTecnico) return ordenes;
    return ordenes.filter((o) => o.tecnico_id === filtroTecnico);
  }, [ordenes, filtroTecnico]);

  const byDay = useMemo(() => {
    const map = {};
    ordenesFiltradas.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    return map;
  }, [ordenesFiltradas]);

  // Build calendar grid for current month
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    // Monday-first: 0=Mon ... 6=Sun
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [year, month]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  }

  const selectedOrdenes = useMemo(() => {
    if (!selectedDay) return [];
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return byDay[key] ?? [];
  }, [selectedDay, byDay]);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>Calendario</h1>
      </div>

      {/* Technician filter */}
      {tecnicos.length > 0 && (
        <div className={styles.filterRow}>
          <select className={styles.filterSelect} value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}>
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Month navigator */}
      <div className={styles.monthNav}>
        <button className={styles.navBtn} onClick={prevMonth}><ChevronLeft size={20} /></button>
        <span className={styles.monthLabel}>{MESES[month]} {year}</span>
        <button className={styles.navBtn} onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando…</p>
      ) : (
        <>
          {/* Day-of-week headers */}
          <div className={styles.grid}>
            {DIAS.map((d) => (
              <div key={d} className={styles.dowHeader}>{d}</div>
            ))}

            {/* Calendar cells */}
            {days.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className={styles.cellEmpty} />;
              const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
              const dayOrdenes = byDay[key] ?? [];
              const isToday = date.toDateString() === today.toDateString();
              const isSelected = selectedDay && date.toDateString() === selectedDay.toDateString();

              return (
                <div
                  key={key}
                  className={`${styles.cell} ${isToday ? styles.cellToday : ""} ${isSelected ? styles.cellSelected : ""}`}
                  onClick={() => setSelectedDay(isSelected ? null : date)}
                >
                  <span className={styles.dayNum}>{date.getDate()}</span>
                  <div className={styles.dots}>
                    {dayOrdenes.slice(0, 5).map((o) => (
                      <span
                        key={o.id}
                        className={styles.dot}
                        style={{ background: ESTADO_COLOR[o.estado] ?? "#6b7280" }}
                      />
                    ))}
                    {dayOrdenes.length > 5 && <span className={styles.dotMore}>+{dayOrdenes.length - 5}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div className={styles.dayDetail}>
              <h3 className={styles.dayDetailTitle}>
                {selectedDay.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                {" — "}{selectedOrdenes.length} {selectedOrdenes.length === 1 ? "orden" : "órdenes"}
              </h3>
              {selectedOrdenes.length === 0 ? (
                <p className={styles.dayEmpty}>Sin órdenes este día.</p>
              ) : (
                <div className={styles.dayList}>
                  {selectedOrdenes.map((o) => (
                    <button
                      key={o.id}
                      className={styles.dayItem}
                      onClick={() => router.push(`/jefe/trabajo/${o.id}`)}
                    >
                      <span
                        className={styles.dayDot}
                        style={{ background: ESTADO_COLOR[o.estado] ?? "#6b7280" }}
                      />
                      <div className={styles.dayItemInfo}>
                        <span className={styles.dayItemId}>{formatId(o)}</span>
                        <span className={styles.dayItemDesc}>{o.descripcion}</span>
                        {o.tecnicos?.nombre && (
                          <span className={styles.dayItemTecnico}>{o.tecnicos.nombre}</span>
                        )}
                      </div>
                      <span
                        className={styles.dayItemEstado}
                        style={{ color: ESTADO_COLOR[o.estado] ?? "#6b7280" }}
                      >
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className={styles.legend}>
            {Object.entries(ESTADO_LABEL).map(([k, v]) => (
              <span key={k} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: ESTADO_COLOR[k] }} />
                {v}
              </span>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
