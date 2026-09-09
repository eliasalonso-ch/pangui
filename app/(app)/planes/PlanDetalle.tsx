"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Wrench, Loader2, CalendarDays, Box, Flag, User, Clock, Tag, MapPin,
  ChevronRight, Pencil, ClockFading, MoreVertical, Trash2,
} from "lucide-react";
import { getPlanDetalle } from "@/lib/planes-api";
import { RECURRENCIA_PLAN_LABELS, type PlanMantencion, type PlanOcurrencia } from "@/types/planes";
import AuditFooter from "@/components/catalogo/AuditFooter";

/**
 * Detalle del plan, en un panel sobre la lista.
 *
 * Lo que responde arriba de todo es "cuánto falta para la próxima", porque es
 * la pregunta por la que alguien abre un plan. El anillo lo hace legible de un
 * vistazo: se llena a medida que se acerca el vencimiento.
 *
 * Es panel y no página aparte para no perder la lista: el uso típico es mirar
 * un plan, cerrar, mirar otro.
 */

const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Mismos valores que la bandeja de activos (ActivosBandeja), para que un activo
// se lea igual aquí que en su propia pantalla.
const ESTADO_ACTIVO_LABEL: Record<string, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ESTADO_ACTIVO_COLOR: Record<string, string> = {
  operativo: "var(--success)",
  fuera_servicio: "var(--danger)",
  // Naranja pleno y no --warning: ese token es un ámbar oscuro pensado para
  // texto y como relleno de un punto se ve marrón.
  mantencion: "#F59E0B",
  baja: "var(--st-cancel-dot)",
};

interface Detalle {
  plan: PlanMantencion;
  activoNombre: string | null;
  activoImagen: string | null;
  activoEstado: string | null;
  categoriaNombre: string | null;
  ubicacionNombre: string | null;
  asignados: { id: string; nombre: string }[];
  ocurrencias: PlanOcurrencia[];
}

export default function PlanDetalle({
  id, onClose, onArchivar, onEditar, onEliminar, embedded = false,
}: {
  id: string;
  onClose: () => void;
  onArchivar: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  /** En la bandeja ocupa el panel derecho; fuera de ella conserva el modal. */
  embedded?: boolean;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Clic fuera cierra el menú de acciones.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    getPlanDetalle(id)
      .then(res => { if (vivo) setD(res); })
      .catch(e => { if (vivo) setError((e as Error).message); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [id]);

  // Escape cierra, como cualquier panel modal de la app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={embedded ? undefined : onClose}
      style={{
        ...(embedded
          ? { flex: 1, minWidth: 0, display: "flex", background: "var(--surface-canvas)" }
          : {
              position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }),
      }}
    >
      <div
        role={embedded ? undefined : "dialog"}
        aria-modal={embedded ? undefined : true}
        onClick={embedded ? undefined : e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: embedded ? "none" : 720, maxHeight: embedded ? "none" : "90vh",
          display: "flex", flexDirection: "column",
          background: embedded ? "transparent" : "var(--surface-1)",
          border: embedded ? "none" : "1px solid var(--border)",
          borderRadius: embedded ? 0 : 12, boxShadow: embedded ? "none" : "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        {/* Encabezado.
            Empotrado continúa la barra de herramientas de la izquierda, así que
            comparte su tono y su altura (56) para que ambas lean como una sola
            franja de chrome. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: embedded ? "9px 20px" : "16px 20px",
          minHeight: embedded ? 56 : undefined,
          borderBottom: "1px solid var(--border)", flexShrink: 0,
          background: embedded ? "var(--surface-canvas)" : "var(--surface-1)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Chip del número: mismas medidas que el "OT #" de OTDetail
                (minHeight 24, padding 0 9px, surface-1 con borde), para que un
                plan y una orden se identifiquen igual. */}
            {d?.plan.numero != null && (
              <div style={{
                display: "inline-flex", alignItems: "center",
                minHeight: 24, padding: "0 9px", marginBottom: 6,
                border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                background: "var(--surface-1)", color: "var(--fg-1)",
                fontSize: 14, fontWeight: 400,
              }}>
                #{d.plan.numero}
              </div>
            )}
            <h2 style={{
              margin: 0, fontSize: 20, fontWeight: 500, color: "var(--fg-1)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {d?.plan.nombre ?? "Plan de mantención"}
            </h2>
          </div>

          {/* Editar con etiqueta, como en OTDetail: es la acción principal del
              panel y un ícono suelto no la anuncia. */}
          {d && onEditar && (
            <button
              type="button"
              onClick={onEditar}
              style={{
                flexShrink: 0, height: 34, padding: "0 13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "var(--brand)", border: "1px solid var(--brand)",
                borderRadius: "var(--r-sm)", cursor: "pointer",
                color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400,
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
            >
              <Pencil size={14} />
              Editar
            </button>
          )}
          {/* Pausar en naranja: es una acción que detiene algo en marcha, ni
              neutra ni destructiva. --warning ya trae su variante para modo
              oscuro. */}
          {d && (
            <button
              onClick={onArchivar}
              title="Pausar plan"
              aria-label="Pausar plan"
              style={{
                ...iconBtn,
                width: 34, height: 34,
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "var(--warning-bg)",
                color: "var(--warning)",
              }}
            >
              <ClockFading size={16} />
            </button>
          )}

          {d && onEliminar && (
            <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                title="Más acciones"
                aria-label="Más acciones"
                style={{
                  width: 34, height: 34, display: "flex", alignItems: "center",
                  justifyContent: "center", background: "var(--surface-1)",
                  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                  cursor: "pointer", color: "var(--fg-1)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-sm)",
                  width: 210, overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onEliminar(); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 12px", background: "var(--surface-1)", border: "none",
                      cursor: "pointer", fontSize: 14, color: "var(--danger)",
                      fontFamily: "inherit", textAlign: "left",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                  >
                    <Trash2 size={16} /> Eliminar plan
                  </button>
                </div>
              )}
            </div>
          )}
          {/* La X solo en modal: ahí no hay otra salida visible. Empotrado se
              cierra eligiendo otro plan, y el botón sobraba en la fila. */}
          {!embedded && (
            <button onClick={onClose} aria-label="Cerrar" style={iconBtn}>
              <X size={17} />
            </button>
          )}
        </div>

        {/* Cuerpo.
            El crema va aquí, detrás de las tarjetas — nunca en las tarjetas
            mismas: en este sistema una tarjeta siempre es --surface-1 y lo que
            cambia es la superficie sobre la que descansa (globals.css: "cards
            ARE --surface-1"). El encabezado se queda blanco para que la barra
            de título se lea como parte del marco del panel. */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "20px",
          // Empotrado comparte plano con la lista de al lado, así que va al
          // mismo tono canvas; el gris hundido ahí se leía como otra capa. En
          // el modal sí hace falta, porque flota sobre el overlay y necesita
          // separarse del blanco de su propio marco.
          background: embedded ? "var(--surface-canvas)" : "var(--color-kumo-recessed)",
        }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : error || !d ? (
            <p style={{ fontSize: 14, color: "var(--danger, #b42318)" }}>
              {error ?? "No se encontró el plan."}
            </p>
          ) : (
            <Contenido d={d} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Fechas visibles antes de pedir "cargar más". */
const OCURRENCIAS_VISIBLES = 4;

function Contenido({ d }: { d: Detalle }) {
  const { plan } = d;

  // Cuántas fechas se muestran. Crece de a OCURRENCIAS_VISIBLES: el horizonte
  // de un plan anual son decenas de filas y la pregunta habitual es "qué viene
  // ahora", no la lista entera.
  const [visibles, setVisibles] = useState(OCURRENCIAS_VISIBLES);
  const proxima = d.ocurrencias.find(o => o.estado === "programada" || o.estado === "avisada");
  const generadas = d.ocurrencias.filter(o => o.orden_id);

  return (
    <>
      <Bloque titulo="Programa">
        <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Las órdenes de trabajo siguen el calendario del plan, aunque una se
          termine antes o después de lo previsto.
        </p>

        <div style={{
          border: "1px solid var(--border)", borderRadius: 10,
          background: "var(--surface-1)", padding: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <CalendarDays size={16} style={{ color: "var(--brand)" }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>
              Tiempo hasta la próxima mantención
            </span>
          </div>

          <CuentaRegresiva
            fecha={proxima?.fecha_programada ?? null}
            hora={plan.hora_vencimiento}
            diasAviso={plan.dias_aviso_previo}
          />

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <Fila etiqueta="Horario">
              <div>{describirHorario(plan)}</div>
              <div style={{ color: "var(--fg-3)", marginTop: 3 }}>
                {plan.dias_apertura_previa === 0
                  ? "La orden se abre el mismo día del vencimiento"
                  : `La orden se abre ${plan.dias_apertura_previa} ${plan.dias_apertura_previa === 1 ? "día" : "días"} antes del vencimiento`}
              </div>
            </Fila>
            <Fila etiqueta="Aviso previo">
              {plan.dias_aviso_previo === 0
                ? "Sin aviso anticipado"
                : `${plan.dias_aviso_previo} días antes, para preparar la mantención`}
            </Fila>
            <Fila etiqueta="Horizonte">
              {plan.horizonte_dias} días por adelantado
            </Fila>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Detalles de la orden de trabajo">
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          border: "1px solid var(--border)", borderRadius: 10,
          padding: "14px 16px", background: "var(--surface-1)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>
              {plan.titulo_ot?.trim() || plan.nombre}
            </div>
            {plan.descripcion_ot?.trim() && (
              <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 4, lineHeight: 1.5 }}>
                {plan.descripcion_ot}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
              {plan.tipo_trabajo && (
                <Meta icono={<Wrench size={16} />}>{capital(plan.tipo_trabajo)}</Meta>
              )}
              {plan.prioridad && plan.prioridad !== "ninguna" && (
                <Meta icono={<Flag size={16} />}>{capital(plan.prioridad)}</Meta>
              )}
              {d.categoriaNombre && <Meta icono={<Tag size={16} />}>{d.categoriaNombre}</Meta>}
              {d.ubicacionNombre && <Meta icono={<MapPin size={16} />}>{d.ubicacionNombre}</Meta>}
              {plan.duracion_estimada_horas && (
                <Meta icono={<Clock size={16} />}>{formatearHoras(plan.duracion_estimada_horas)}</Meta>
              )}
              {d.asignados.length > 0 && (
                <Meta icono={<User size={16} />}>
                  {d.asignados.map(a => a.nombre).join(", ")}
                </Meta>
              )}
            </div>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Activo">
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          border: "1px solid var(--border)", borderRadius: 10,
          padding: "12px 16px", background: "var(--surface-1)",
        }}>
          {/* Miniatura del equipo: se reconoce sin leer. */}
          {d.activoImagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.activoImagen}
              alt=""
              style={{
                width: 36, height: 36, borderRadius: "var(--r-sm)",
                objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0,
              }}
            />
          ) : (
            <span style={{
              width: 36, height: 36, borderRadius: "var(--r-sm)", flexShrink: 0,
              background: "var(--brand-tint)", color: "var(--brand)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <Box size={18} />
            </span>
          )}

          <span style={{
            flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {d.activoNombre ?? "Sin activo"}
          </span>

          {/* Estado a la derecha, como chip con borde: mismas medidas que el
              RowBadge de la bandeja de activos (minHeight 22, padding 0 8px,
              punto de color + etiqueta). */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 14, fontWeight: 400,
            padding: "0 8px", minHeight: 22, flexShrink: 0,
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            color: "var(--fg-1)",
            background: "var(--surface-1)",
            whiteSpace: "nowrap",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: ESTADO_ACTIVO_COLOR[d.activoEstado ?? ""] ?? "#94A3B8",
            }} />
            {ESTADO_ACTIVO_LABEL[d.activoEstado ?? ""] ?? "Sin estado"}
          </span>
        </div>
      </Bloque>

      <Bloque
        titulo={`Próximas fechas${d.ocurrencias.length ? ` (${d.ocurrencias.length})` : ""}`}
        acciones={
          generadas.length > 0 ? (
            <AccionBloque href="/ordenes/lista">
              Ver las {generadas.length} órdenes creadas
              <ChevronRight size={16} />
            </AccionBloque>
          ) : undefined
        }
      >
        {d.ocurrencias.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--fg-3)", margin: 0 }}>
            Todavía no hay fechas calculadas para este plan.
          </p>
        ) : (
          <div style={{
            border: "1px solid var(--border)", borderRadius: 10,
            background: "var(--surface-1)", overflow: "hidden",
          }}>
            {d.ocurrencias.slice(0, visibles).map((o, i) => (
              <div
                key={o.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px", fontSize: 14,
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--fg-4)", width: 26, flexShrink: 0 }}>
                  {o.iteracion}
                </span>
                <span style={{ flex: 1, color: "var(--fg-1)" }}>
                  {fechaLarga(o.fecha_programada)}
                </span>
                <EstadoBadge estado={o.estado} />
              </div>
            ))}

            {/* "Ver más" al pie: es donde llega el ojo después de leer las
                fechas, y crece de a OCURRENCIAS_VISIBLES. */}
            {d.ocurrencias.length > visibles && (
              <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>
                <AccionBloque onClick={() => setVisibles(v => v + OCURRENCIAS_VISIBLES)}>
                  + Ver más
                </AccionBloque>
              </div>
            )}
          </div>
        )}
      </Bloque>

      {/* Pie de auditoria: el mismo de material y activo. Reemplaza al
          "Creado el ..." suelto, que decia cuando pero no quien, ni si alguien
          lo habia tocado despues. */}
      <AuditFooter
        creador={plan.creador}
        creadoEn={plan.created_at}
        actualizador={plan.actualizador}
        actualizadoEn={plan.updated_at}
      />
    </>
  );
}

/**
 * Anillo de progreso hacia el vencimiento.
 *
 * Se llena a medida que se acerca la fecha, y toma el color de aviso cuando
 * entra en la ventana en que hay que ir preparando la mantención. La escala es
 * la ventana de aviso del plan, no una fija: en un plan que avisa a 30 días,
 * faltar 15 es media vuelta.
 */
function CuentaRegresiva({
  fecha, hora, diasAviso,
}: {
  fecha: string | null;
  hora: string | null;
  diasAviso: number;
}) {
  if (!fecha) {
    return (
      <div style={{ fontSize: 14, color: "var(--fg-3)" }}>
        Sin fechas programadas.
      </div>
    );
  }

  const dias = diasHasta(fecha);
  const escala = Math.max(diasAviso, 1);
  // Vencido o dentro del último día = anillo completo.
  const progreso = dias <= 0 ? 1 : Math.max(0, Math.min(1, 1 - dias / escala));
  const enVentana = dias >= 0 && dias <= diasAviso;
  const vencido = dias < 0;

  const color = vencido ? "var(--danger, #b42318)" : enVentana ? "var(--brand)" : "var(--fg-4)";
  const R = 26;
  const circ = 2 * Math.PI * R;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={68} height={68} viewBox="0 0 68 68" style={{ flexShrink: 0 }}>
        <circle cx={34} cy={34} r={R} fill="none" stroke="var(--border)" strokeWidth={6} />
        <circle
          cx={34} cy={34} r={R} fill="none"
          stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progreso)}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "var(--fg-1)" }}>
          {vencido
            ? `Vencida hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`
            : dias === 0
              ? "Vence hoy"
              : `${dias} ${dias === 1 ? "día restante" : "días restantes"}`}
        </div>
        <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 3 }}>
          Próximo vencimiento: {fechaLarga(fecha)}
          {hora ? `, ${hora.slice(0, 5)}` : ""}
        </div>
      </div>
    </div>
  );
}

/* ── piezas ────────────────────────────────────────────────────────────── */

function Bloque({ titulo, acciones, children }: {
  titulo: string;
  /** Enlaces a la derecha del título, en la misma línea. */
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, margin: "0 0 10px",
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", margin: 0 }}>
          {titulo}
        </h3>
        {acciones && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            {acciones}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** Enlace de acción del encabezado de un bloque. */
function AccionBloque({ onClick, href, children }: {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 14, fontWeight: 500, color: "var(--brand)",
    background: "none", border: "none", padding: 0,
    fontFamily: "inherit", cursor: "pointer", textDecoration: "none",
    whiteSpace: "nowrap",
  };
  return href
    ? <a href={href} style={estilo}>{children}</a>
    : <button type="button" onClick={onClick} style={estilo}>{children}</button>;
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 14, alignItems: "flex-start" }}>
      <span style={{ width: 110, flexShrink: 0, color: "var(--fg-3)" }}>{etiqueta}</span>
      <div style={{ flex: 1, minWidth: 0, color: "var(--fg-1)" }}>{children}</div>
    </div>
  );
}

function Meta({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 14, color: "var(--fg-3)",
    }}>
      {/* El ícono en color de marca y el texto en gris: así ancla la fila sin
          que el dato entero compita con el título de la tarjeta. */}
      <span style={{ display: "inline-flex", color: "var(--brand)" }}>{icono}</span>
      {children}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: PlanOcurrencia["estado"] }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    programada: { label: "Programada", color: "var(--fg-3)", bg: "var(--surface-hover)" },
    avisada:    { label: "Avisada",    color: "var(--brand)", bg: "var(--brand-tint)" },
    generada:   { label: "OT creada",  color: "var(--brand)", bg: "var(--brand-tint)" },
    completada: { label: "Completada", color: "var(--fg-3)", bg: "var(--surface-hover)" },
    omitida:    { label: "Omitida",    color: "var(--fg-4)", bg: "var(--surface-hover)" },
  };
  const c = cfg[estado] ?? cfg.programada;
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 20, fontSize: 14,
      color: c.color, background: c.bg, whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

/* ── helpers ───────────────────────────────────────────────────────────── */

/**
 * Las fechas `date` de Postgres llegan como "2026-09-14" y se parten a mano:
 * pasarlas por `new Date(str)` las lee como UTC y en Chile puede restar un día.
 */
function parseFecha(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diasHasta(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((parseFecha(fecha).getTime() - hoy.getTime()) / 86400000);
}

function fechaLarga(s: string): string {
  return parseFecha(s).toLocaleDateString("es-CL", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatearHoras(h: number): string {
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  return [horas > 0 ? `${horas} h` : null, mins > 0 ? `${mins} min` : null]
    .filter(Boolean).join(" ") || "—";
}

/** "Se repite cada 2 semanas el lunes" — la recurrencia en una frase. */
function describirHorario(plan: PlanMantencion): string {
  const cfg = plan.recurrencia_config ?? {};
  const n = Math.max(1, Number(cfg.interval ?? 1));
  const dia = Array.isArray(cfg.weekdays) && cfg.weekdays.length
    ? DIAS_LARGOS[cfg.weekdays[0]]
    : null;

  switch (plan.recurrencia) {
    case "diaria":
      return Array.isArray(cfg.weekdays) && cfg.weekdays.length && cfg.weekdays.length < 7
        ? `Se repite los ${cfg.weekdays.map(d => DIAS_LARGOS[d]).join(", ")}`
        : n === 1 ? "Se repite todos los días" : `Se repite cada ${n} días`;
    case "semanal":
      return `Se repite cada ${n === 1 ? "semana" : `${n} semanas`}${dia ? ` el ${dia}` : ""}`;
    case "mensual":
    case "mensual_fecha":
      return `Se repite cada ${n === 1 ? "mes" : `${n} meses`}${cfg.day_of_month ? ` el día ${cfg.day_of_month}` : ""}`;
    case "mensual_dia":
      return `Se repite cada ${n === 1 ? "mes" : `${n} meses`}${dia ? ` el ${ordinal(cfg.week_ordinal)} ${dia}` : ""}`;
    case "anual":
      return `Se repite cada ${n === 1 ? "año" : `${n} años`}`;
    default:
      return RECURRENCIA_PLAN_LABELS[plan.recurrencia] ?? plan.recurrencia;
  }
}

function ordinal(n: number | null | undefined): string {
  if (n === -1) return "último";
  return `${n ?? 1}º`;
}

const iconBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 6, border: "none", flexShrink: 0,
  background: "transparent", color: "var(--fg-3)", cursor: "pointer",
};
