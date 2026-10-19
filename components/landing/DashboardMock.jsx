import { useEffect, useRef, useState } from "react";
import {
  BarChart2,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Plus,
  Users,
} from "lucide-react";
import { Engine } from "@/components/icons/Engine";

// Réplica estática de /inicio (app/(app)/inicio/page.tsx) para la landing:
// mismos tokens claros de la app (--brand #007AFF, --success, --warning,
// --danger, bordes #E5E8EE) y mismas tarjetas. Datos inventados, nunca de un
// cliente real. Si /inicio cambia de forma, revisar esto.
//
// Siempre se dibuja con el layout de escritorio. Bajo ANCHO px se renderiza a
// ANCHO y se achica con `zoom` (no transform: zoom también reduce el alto en el
// layout, y LaserFlow mide bien el borde): en móvil se ve como una captura del
// tablero real, no como una versión apretada en 2 columnas.
const ANCHO = 820;
const COMPACTO = 600;

const C = {
  brand: "#007AFF",
  success: "#0B8A4B",
  warning: "#B26A00",
  danger: "#D6231C",
  border: "#E5E8EE",
  canvas: "#FAFAF9",
  fg3: "#55617A",
  fg4: "#6B7689",
};

const NAV = [
  { icon: LayoutDashboard, label: "Inicio", active: true },
  { icon: ClipboardList, label: "Órdenes" },
  { icon: Engine, label: "Activos" },
  { icon: BarChart2, label: "Analítica de órdenes" },
  { icon: BarChart2, label: "Analítica de activos" },
  { icon: ClipboardCheck, label: "Procedimientos" },
  { icon: Boxes, label: "Materiales" },
  { icon: Users, label: "Equipo" },
];

const KPIS = [
  { label: "En curso", value: "12", sub: "en ejecución ahora" },
  { label: "En espera", value: "4", sub: "órdenes pausadas", color: C.success },
  { label: "Sin asignar", value: "3", sub: "sin técnico asignado", color: C.success },
  { label: "Asignadas", value: "28", sub: "con técnico asignado" },
];

// Últimos 14 días: [creadas, completadas]
const FLUJO = [
  [6, 5], [8, 7], [5, 6], [9, 8], [7, 7], [3, 4], [2, 2],
  [10, 8], [8, 9], [7, 6], [11, 10], [9, 9], [4, 5], [3, 3],
];

const ATENCION = [
  { n: 1042, titulo: "Mantención chiller Torre B", detalle: "Sala de máquinas", motivo: "Faltan materiales", color: C.warning },
  { n: 1038, titulo: "Cambio de contactor tablero TG-2", detalle: "Edificio Central", motivo: "Vencida hace 2 días", color: C.danger },
  { n: 1051, titulo: "Revisión bomba de impulsión 3", detalle: "Planta norte", motivo: "Sin acceso", color: C.warning },
  { n: 1055, titulo: "Filtración en sala eléctrica", detalle: "Bodega 4", motivo: "Sin asignar", color: C.fg3 },
];

function Tarjeta({ title, hint, children, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-[10px] border bg-white ${className}`} style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5" style={{ borderColor: C.border }}>
        <span className="text-[12px] text-black">{title}</span>
        {hint && <span className="text-[12px]" style={{ color: C.fg4 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function DashboardMock() {
  const max = Math.max(...FLUJO.flat());
  const caja = useRef(null);
  const [ancho, setAncho] = useState(0);
  // Bajo COMPACTO px (móvil) no se achica: pasa a una vista simple sin
  // sidebar ni gráficos, a tamaño legible, como la tarjeta de la referencia.
  const compacto = ancho > 0 && ancho < COMPACTO;
  const zoom = compacto || !ancho ? 1 : Math.min(1, ancho / ANCHO);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setAncho(entry.contentRect.width));
    ro.observe(caja.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={caja}>
    <div
      className="overflow-hidden rounded-[14px] border border-[#E5E8EE] bg-white text-left shadow-[0_30px_80px_-30px_rgba(15,23,42,0.35)]"
      style={zoom < 1 ? { width: ANCHO, zoom } : undefined}
    >
      {/* Barra de ventana */}
      <div className="flex items-center gap-1.5 border-b bg-[#F4F5F7] px-3.5 py-2.5" style={{ borderColor: C.border }}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
      </div>

      <div className="flex" style={{ background: C.canvas }}>
        {/* Sidebar */}
        {!compacto && <aside className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r p-3" style={{ borderColor: C.border }}>
          {NAV.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[12px]"
              style={active ? { background: "#EAF3FF", color: C.brand } : { color: "#1C2333" }}
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </aside>}

        {/* Contenido */}
        <div className={`min-w-0 flex-1 ${compacto ? "p-4" : "p-6"}`}>
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px]" style={{ color: C.fg3 }}>Lunes 19 de octubre</p>
              <p className="text-[16px] font-medium tracking-[-0.02em] text-black">Buenos días, Camila</p>
            </div>
            {!compacto && <span
              className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] text-white"
              style={{ background: C.brand }}
            >
              <Plus size={13} strokeWidth={2} />
              Nueva Orden de Trabajo
            </span>}
          </div>

          <div className={`mb-5 grid gap-2 ${compacto ? "grid-cols-2" : "grid-cols-4"}`}>
            {KPIS.map(k => (
              <div
                key={k.label}
                className="rounded-[10px] border bg-white px-3 py-2.5"
                style={{ borderColor: C.border }}
              >
                <div className="mb-1 text-[11px] text-black">{k.label}</div>
                <div className="mb-0.5 text-[16px] font-medium tabular-nums tracking-[-0.02em]" style={{ color: k.color ?? "#000" }}>
                  {k.value}
                </div>
                <div className="truncate text-[11px] text-black">{k.sub}</div>
              </div>
            ))}
          </div>

          {!compacto && <div className="mb-5 grid grid-cols-[1.4fr_1fr] gap-2">
            <Tarjeta title="Creadas vs completadas" hint="Últimos 14 días">
              <div className="flex h-[118px] items-end gap-[5px] px-3.5 pb-3 pt-3">
                {FLUJO.map(([creadas, completadas], i) => (
                  <div key={i} className="flex h-full flex-1 items-end gap-[2px]">
                    <div className="flex-1 rounded-t-[2px]" style={{ height: `${(creadas / max) * 100}%`, background: C.brand }} />
                    <div className="flex-1 rounded-t-[2px]" style={{ height: `${(completadas / max) * 100}%`, background: C.success }} />
                  </div>
                ))}
              </div>
            </Tarjeta>

            <Tarjeta title="Planificado vs no planificado">
              <div className="flex h-[118px] flex-col justify-center gap-3 px-3.5">
                <div className="flex h-6 overflow-hidden rounded-[6px]">
                  <div style={{ width: "64%", background: C.success }} />
                  <div className="flex-1" style={{ background: C.danger }} />
                </div>
                {[
                  { c: C.success, l: "Planificado (preventiva)", v: 158 },
                  { c: C.danger, l: "No planificado (reactiva/emergencia)", v: 88 },
                ].map(r => (
                  <div key={r.l} className="flex items-center gap-2 text-[11px] text-black">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.c }} />
                    <span className="min-w-0 flex-1 truncate">{r.l}</span>
                    <span>{r.v}</span>
                  </div>
                ))}
              </div>
            </Tarjeta>
          </div>}

          <Tarjeta title={`Requieren atención (${ATENCION.length})`}>
            {ATENCION.map((r, i) => (
              <div
                key={r.n}
                className="flex h-[38px] items-center gap-2.5 px-3.5"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-black">
                  #{r.n} · {r.titulo}
                  {!compacto && <span style={{ color: C.fg4 }}> · {r.detalle}</span>}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: r.color }}>{r.motivo}</span>
              </div>
            ))}
          </Tarjeta>
        </div>
      </div>
    </div>
    </div>
  );
}
