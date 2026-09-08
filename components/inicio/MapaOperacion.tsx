"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, AlertTriangle, UserRoundX, Pause, RotateCw, Check } from "lucide-react";
import type { UbicacionRef } from "@/lib/queries";
import { cargarMaps, ESTILO_MAPA_LIMPIO, colorMarca, iconoCirculo } from "@/lib/google-maps";

/** Solo lo que el mapa necesita de una OT (definido aquí para no acoplarse al dashboard). */
export type OTMapa = {
  id: string;
  titulo: string | null;
  estado: string;
  numero?: number | null;
  fecha_termino: string | null;
  ubicacion_id: string | null;
  lugar: string | null;
  asignados_ids: string[] | null;
};

/**
 * Mapa de estado de las OT abiertas, agrupadas por ubicacion.
 *
 * NO es seguimiento de personas: el pin representa la UBICACION (coordenada
 * fija) y resume las OT que hay ahi. No se guarda ni se muestra la posicion del
 * trabajador en ningun momento.
 *
 * Los lugares especificos no tienen coordenada a proposito: son interiores que
 * colapsarian en el mismo pin. Se listan como texto al abrir una ubicacion.
 */

/**
 * Estados: mismas etiquetas e iconos que /ordenes (OTDetail). El mapa no debe
 * inventar vocabulario propio ni mostrar el valor crudo de la base
 * ("en_espera" con guion bajo).
 */
const ESTADO: Record<
  string,
  { label: string; icon: typeof UserRoundX; color: string }
> = {
  pendiente:  { label: "Sin asignar", icon: UserRoundX, color: "var(--st-open-dot)" },
  en_espera:  { label: "En espera",   icon: Pause,      color: "var(--st-wait-dot)" },
  en_curso:   { label: "En curso",    icon: RotateCw,   color: "var(--st-progress-dot)" },
  completado: { label: "Completada",  icon: Check,      color: "var(--st-done-dot)" },
};

/**
 * Color del pin segun el estado DOMINANTE de la ubicacion, en este orden:
 *   en curso  -> azul   (hay al menos una OT activa ahi)
 *   en espera -> naranjo (hay OT detenidas, ninguna activa)
 *   sin asignar -> gris (solo pendientes)
 *
 * Es una jerarquia, no un conteo: basta UNA OT en curso para que la ubicacion
 * se lea como activa. Los mismos tokens que usa /ordenes, para que el mapa no
 * invente su propia paleta.
 */
const PIN = {
  en_curso:  "var(--st-progress-dot)",
  en_espera: "var(--st-wait-dot)",
  pendiente: "var(--st-open-dot)",
  vacio:     "#cbd5e1",
} as const;

type Dominante = keyof typeof PIN;


/**
 * Resuelve un var(--token) a color literal.
 *
 * Google Maps dibuja los marcadores en canvas y no entiende variables CSS, pero
 * leerlas del DOM mantiene el mapa alineado al tema claro/oscuro en vez de
 * hardcodear la paleta aqui.
 */
function colorDe(d: Dominante): string {
  const v = PIN[d];
  if (typeof window === "undefined" || !v.startsWith("var(")) return v;
  const token = v.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#94a3b8";
}

/**
 * Severidad por cantidad, en tramos discretos.
 *
 * Se prefiere sobre un degradado continuo: el supervisor necesita responder
 * "cuales son mis sitios problematicos y que tan graves" de un vistazo, y una
 * rampa suave obliga a comparar tonos parecidos. Dos canales visuales: el COLOR
 * dice la gravedad y el TAMANO la cantidad.
 *
 * La escala esta topada a proposito. Sin tope, un sitio con 200 vencidas
 * dejaria a uno con 10 pareciendo insignificante.
 */
const SEVERIDAD = [
  { min: 11, color: "#8B1A10", radio: 20, label: "11+" },
  { min: 6,  color: "#D63012", radio: 17, label: "6–10" },
  { min: 3,  color: "#F07018", radio: 14, label: "3–5" },
  { min: 1,  color: "#E8B400", radio: 11, label: "1–2" },
] as const;

function severidad(n: number) {
  return SEVERIDAD.find(x => n >= x.min) ?? null;
}

/** Iniciales para el avatar del tecnico, igual que en "En terreno ahora". */
function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

type Grupo = {
  ubicacion: UbicacionRef;
  ots: OTMapa[];
  enCurso: number;
  vencidas: number;
  dominante: Dominante;
  /** Texto del pin: iniciales del tecnico si hay trabajo activo, si no el conteo. */
  etiqueta: string;
};

export default function MapaOperacion({
  ots,
  ubicaciones,
  equipo = [],
  socId,
  calor,
  onSocId,
  onAbrirOT,
}: {
  ots: OTMapa[];
  ubicaciones: UbicacionRef[];
  equipo?: { id: string; nombre: string }[];
  /** Filtro de asociacion; se controla desde el header de la tarjeta. */
  socId: string;
  calor: "no" | "total" | "vencidas";
  onSocId: (v: string) => void;
  onAbrirOT: (id: string) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const marcadoresRef = useRef<any[]>([]);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Grupo | null>(null);

  const nombrePorId = useMemo(
    () => new Map(equipo.map(u => [u.id, u.nombre])),
    [equipo],
  );



  // TODAS las ubicaciones con coordenada, tengan o no OT abiertas. Las que no
  // tienen quedan en gris tenue: así el mapa sirve también para verificar que
  // una coordenada recién puesta cayó donde corresponde.
  const grupos = useMemo<Grupo[]>(() => {
    const delFiltro = socId === "todas" ? ubicaciones
      : socId === "sin" ? ubicaciones.filter(u => !u.sociedad_id)
      : ubicaciones.filter(u => u.sociedad_id === socId);
    const conCoord = delFiltro.filter(u => u.lat != null && u.lng != null);
    const acc = new Map<string, OTMapa[]>();
    for (const o of ots) {
      if (o.estado === "completado") continue;
      if (!o.ubicacion_id) continue;
      const lista = acc.get(o.ubicacion_id) ?? [];
      lista.push(o);
      acc.set(o.ubicacion_id, lista);
    }
    const hoy = new Date().toISOString().slice(0, 10);
    return conCoord.map(u => {
      const lista = acc.get(u.id) ?? [];
      const enCurso = lista.filter(o => o.estado === "en_curso").length;
      const vencidas = lista.filter(
        o => o.estado !== "en_curso" && o.fecha_termino && o.fecha_termino < hoy,
      ).length;
      // Jerarquia: una sola OT en curso manda sobre cualquier cantidad de
      // pendientes. "vencidas" no cambia el color: se muestra en el heatmap.
      const dominante: Dominante =
        lista.length === 0 ? "vacio"
        : enCurso > 0 ? "en_curso"
        : lista.some(o => o.estado === "en_espera") ? "en_espera"
        : "pendiente";
      // Con trabajo activo el pin muestra las INICIALES de quien esta en
      // terreno: el supervisor identifica a la persona sin abrir el pin.
      // Si hay varias personas activas, el conteo es mas honesto que elegir una.
      const activos = lista
        .filter(o => o.estado === "en_curso")
        .flatMap(o => o.asignados_ids ?? [])
        .map(id => nombrePorId.get(id))
        .filter((n): n is string => !!n);
      const unicos = [...new Set(activos)];

      const etiqueta = unicos.length === 1 ? iniciales(unicos[0])
        : lista.length > 0 ? String(lista.length)
        : "";

      return { ubicacion: u, ots: lista, enCurso, vencidas, dominante, etiqueta };
    });
  }, [ots, ubicaciones, socId, nombrePorId]);

  /**
   * OT en curso que el filtro esta ocultando.
   *
   * Importa porque 84 de 175 ubicaciones no tienen asociacion asignada: al
   * filtrar por una, el trabajo activo de las demas desaparece del mapa sin
   * ninguna senal. Aqui se avisa y se ofrece volver a "todas".
   */
  const activasOcultas = useMemo(() => {
    if (socId === "todas") return 0;
    const visibles = new Set(grupos.map(g => g.ubicacion.id));
    return ots.filter(o => o.estado === "en_curso" && o.ubicacion_id && !visibles.has(o.ubicacion_id)).length;
  }, [ots, grupos, socId]);

  const sinCoordenada = useMemo(() => {
    const conCoord = new Set(ubicaciones.filter(u => u.lat != null).map(u => u.id));
    const ids = new Set(
      ots.filter(o => o.estado !== "completado" && o.ubicacion_id && !conCoord.has(o.ubicacion_id))
         .map(o => o.ubicacion_id as string),
    );
    return ids.size;
  }, [ots, ubicaciones]);

  // Inicializa el mapa una vez.
  useEffect(() => {
    if (!apiKey || !divRef.current || mapRef.current) return;
    let cancelado = false;
    cargarMaps(apiKey)
      .then(() => {
        if (cancelado || !divRef.current || !window.google?.maps?.Map) return;
        mapRef.current = new window.google.maps.Map(divRef.current, {
          // Centro por defecto; fitBounds lo reemplaza apenas hay pines.
          center: { lat: -36.8299341, lng: -73.0357019 },
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: ESTILO_MAPA_LIMPIO,
        });
        setListo(true);
      })
      .catch(e => !cancelado && setError(e.message));
    return () => { cancelado = true; };
  }, [apiKey]);

  // Redibuja los marcadores cuando cambian los grupos.
  useEffect(() => {
    if (!listo || !mapRef.current || !window.google?.maps?.Marker) return;
    const g = window.google.maps;

    for (const m of marcadoresRef.current) m.setMap(null);
    marcadoresRef.current = [];

    const bounds = new g.LatLngBounds();
    for (const grupo of grupos) {
      const pos = { lat: grupo.ubicacion.lat!, lng: grupo.ubicacion.lng! };
      // Modo severidad: el conteo elegido (total o vencidas) define color y
      // tamano. Modo normal: color por estado dominante, tamano fijo.
      const conteo = calor === "vencidas" ? grupo.vencidas
        : calor === "total" ? grupo.ots.length
        : 0;
      const sev = calor === "no" ? null : severidad(conteo);

      // En modo severidad, una ubicacion sin nada que reportar se atenua en vez
      // de desaparecer: sigue siendo util saber que existe y esta sana.
      const radio = sev ? sev.radio
        : calor !== "no" ? 6
        : grupo.ots.length === 0 ? 7
        : grupo.ots.length >= 10 ? 15
        : 12;

      const texto = calor === "no" ? grupo.etiqueta
        : conteo > 0 ? String(conteo)
        : "";

      const marcador = new g.Marker({
        position: pos,
        map: mapRef.current,
        title: `${grupo.ubicacion.edificio ?? ""}${grupo.ots.length ? ` \u00b7 ${grupo.ots.length} OT` : " \u00b7 sin OT pendientes"}`,
        // El numero va DENTRO del marcador: el supervisor ve la magnitud sin
        // tener que abrir la ubicacion.
        label: texto
          ? {
              text: texto,
              color: "#fff",
              fontSize: texto.length > 2 ? "11px" : "12px",
              fontWeight: "600",
            }
          : undefined,
        icon: iconoCirculo(g, {
          radio,
          color: sev ? sev.color : colorDe(grupo.dominante),
          opacidad: calor !== "no" && !sev ? 0.3 : 1,
        }),
        // Los mas graves por encima: si dos se solapan, gana el critico.
        zIndex: sev ? 100 + conteo : 1,
      });
      marcador.addListener("click", () => setSel(grupo));
      marcadoresRef.current.push(marcador);
      bounds.extend(pos);
    }

    if (grupos.length > 1) {
      mapRef.current.fitBounds(bounds, 60);
    } else if (grupos.length === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(16);
    }
  }, [grupos, listo, calor]);

  if (!apiKey) {
    return (
      <Aviso>
        Falta <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>. Agrégala al <code>.env.local</code> y
        reinicia el servidor.
      </Aviso>
    );
  }
  if (error) return <Aviso>{error}</Aviso>;

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div
          ref={divRef}
          style={{ width: "100%", height: 360, borderRadius: 8, background: "var(--surface-0)" }}
        />
        {sel && (
          <div
            style={{
              position: "absolute", right: 12, top: 12, width: 280, maxHeight: 320,
              overflowY: "auto", background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <MapPin size={15} style={{ color: PIN[sel.dominante], flexShrink: 0, marginTop: 2 }} />
              <strong style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", lineHeight: 1.3 }}>
                {sel.ubicacion.edificio}
              </strong>
              <button
                onClick={() => setSel(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", fontSize: 16, lineHeight: 1 }}
              >×</button>
            </div>
            {sel.ots.length === 0 && (
              <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "4px 0 0" }}>
                Sin OT pendientes. Coordenada registrada.
              </p>
            )}
            {sel.ots.map(o => (
              <button
                key={o.id}
                onClick={() => onAbrirOT(o.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", background: "none",
                  border: "none", borderTop: "1px solid var(--border)", padding: "8px 0",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
                  {o.numero != null ? `#${o.numero} · ` : ""}{o.titulo || "Sin título"}
                </span>
                {/* El lugar es texto: no tiene coordenada propia a propósito. */}
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  <EstadoPill estado={o.estado} />
                  {/* Quien esta asignado: el supervisor necesita saber QUIEN
                      esta en terreno, no solo que hay trabajo activo ahi. */}
                  {(o.asignados_ids ?? [])
                    .map(id => nombrePorId.get(id))
                    .filter((n): n is string => !!n)
                    .map(n => (
                      <span
                        key={n}
                        title={n}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 14, color: "var(--fg-3)",
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                          background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                          color: "var(--fg-on-brand)", fontSize: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{iniciales(n)}</span>
                        {n}
                      </span>
                    ))}
                  {o.lugar && (
                    <span style={{ fontSize: 14, color: "var(--fg-3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.lugar}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 14, color: "var(--fg-3)" }}>
        {calor === "no" ? (
          <>
            <PuntoLeyenda estado="en_curso" />
            <PuntoLeyenda estado="en_espera" />
            <PuntoLeyenda estado="pendiente" />
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>
              {calor === "vencidas" ? "OT vencidas" : "OT pendientes"}
            </span>
            {/* De menor a mayor, al reves que SEVERIDAD (ordenada por umbral). */}
            {[...SEVERIDAD].reverse().map(x => (
              <span
                key={x.label}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--fg-3)" }}
              >
                <span style={{
                  width: 9, height: 9, borderRadius: "50%", display: "inline-block",
                  background: x.color, flexShrink: 0,
                }} />
                {x.label}
              </span>
            ))}
          </>
        )}
        {activasOcultas > 0 && (
          <button
            onClick={() => onSocId("todas")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, color: "var(--st-progress-dot)",
            }}
          >
            <RotateCw size={13} />
            {activasOcultas} en curso fuera de este filtro — ver todas
          </button>
        )}

        {sinCoordenada > 0 && (
          <span
            title="Estas ubicaciones tienen OT pendientes pero aún no tienen coordenada. Ve a Ubicaciones › Posicionar en mapa para agregarlas."
            style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", color: "var(--fg-4)" }}
          >
            <AlertTriangle size={13} />
            {sinCoordenada} {sinCoordenada === 1 ? "ubicación con OT" : "ubicaciones con OT"} {sinCoordenada === 1 ? "no aparece" : "no aparecen"} en el mapa
          </span>
        )}
      </div>
    </div>
  );
}


/** Pildora de estado: mismo tratamiento visual que la pildora de categoria. */
/**
 * Punto de la leyenda: mismo color que el pin del mapa.
 *
 * No usa la pildora con icono a proposito -- la leyenda explica que significa
 * cada COLOR de pin, y un punto es lo que mas se parece a lo que se ve arriba.
 */
function PuntoLeyenda({ estado }: { estado: Dominante }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--fg-3)" }}>
      <span style={{
        width: 9, height: 9, borderRadius: "50%", display: "inline-block",
        background: PIN[estado], flexShrink: 0,
      }} />
      {ESTADO[estado]?.label ?? estado}
    </span>
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const e = ESTADO[estado];
  if (!e) return <span style={{ fontSize: 14, color: "var(--fg-3)" }}>{estado}</span>;
  const Icono = e.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 font-normal border shrink-0"
      style={{
        borderColor: "var(--border-strong)",
        borderRadius: "var(--r-sm)",
        color: "var(--fg-1)",
        background: "transparent",
        fontSize: 14,
      }}
    >
      <span className="inline-flex items-center shrink-0" style={{ color: e.color }}>
        <Icono size={11} />
      </span>
      {e.label}
    </span>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16, border: "1px dashed var(--border)", borderRadius: 8,
      fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}
