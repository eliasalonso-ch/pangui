"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cargarMaps, ESTILO_MAPA_LIMPIO, colorMarca, iconoCirculo } from "@/lib/google-maps";
import type { UbicacionRef } from "@/lib/queries";
import SearchSelect from "@/components/catalogo/SearchSelect";

/**
 * Herramienta para posicionar ubicaciones en el mapa.
 *
 * Existe porque geocodificar los nombres del sistema antiguo acierta ~20%:
 * "AMPLIACION ACERO EDIF. Nº 3" cayó sobre un puente a 12 km, y la mayoría
 * devuelve el centroide de la ciudad. Quien conoce el terreno resuelve cada
 * ubicacion en segundos haciendo clic.
 *
 * Flujo: eliges una ubicacion de la lista -> clic en el mapa -> se guarda con
 * geo_origen='manual'. Se puede arrastrar el pin para corregir.
 */
export default function MapaPosicionar({
  ubicaciones,
  sociedades,
  onGuardado,
}: {
  ubicaciones: UbicacionRef[];
  sociedades: { id: string; nombre: string; lat?: number | null; lng?: number | null }[];
  onGuardado: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const pinRef = useRef<any>(null);
  const otrosRef = useRef<any[]>([]);

  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ lat: number; lng: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Filtro por asociacion: sin esto hay que arrastrar el mapa entre ciudades
  // (la UdeC esta en Concepcion, pero hay faenas en Los Angeles, a ~130 km).
  const [socId, setSocId] = useState<string>("todas");
  // La lista se dibuja de a 20: con cientos de ubicaciones sin coordenada,
  // pintarlas todas de una hacia lento el primer render del panel.
  const PAGINA = 20;
  // El paginado se guarda junto a la clave del filtro: al cambiar de
  // asociacion o de busqueda el valor viejo se descarta durante el render, sin
  // un efecto que dispare una segunda pasada.
  const [paginado, setPaginado] = useState({ clave: "", n: 1 });
  const centinelaRef = useRef<HTMLDivElement>(null);

  // El filtro se aplica ANTES de separar con/sin coordenada, para que los
  // contadores reflejen la asociacion elegida y no el total del workspace.
  const delFiltro = useMemo(() => {
    if (socId === "todas") return ubicaciones;
    if (socId === "sin") return ubicaciones.filter(u => !u.sociedad_id);
    return ubicaciones.filter(u => u.sociedad_id === socId);
  }, [ubicaciones, socId]);

  const sinCoord = useMemo(
    () => delFiltro.filter(u => u.lat == null || u.lng == null),
    [delFiltro],
  );
  const conCoord = useMemo(
    () => delFiltro.filter(u => u.lat != null && u.lng != null),
    [delFiltro],
  );
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = sinCoord;
    return q ? base.filter(u => (u.edificio ?? "").toLowerCase().includes(q)) : base;
  }, [sinCoord, busqueda]);

  const sel = useMemo(
    () => ubicaciones.find(u => u.id === selId) ?? null,
    [ubicaciones, selId],
  );

  // Inicializa el mapa.
  useEffect(() => {
    if (!apiKey || !divRef.current || mapRef.current) return;
    let cancelado = false;
    cargarMaps(apiKey)
      .then(() => {
        if (cancelado || !divRef.current || !window.google?.maps?.Map) return;
        mapRef.current = new window.google.maps.Map(divRef.current, {
          center: { lat: -36.8299341, lng: -73.0357019 },
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: ESTILO_MAPA_LIMPIO,
        });
        // Clic en el mapa = posicion propuesta para la ubicacion seleccionada.
        mapRef.current.addListener("click", (e: any) => {
          setPendiente({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        setListo(true);
      })
      .catch(e => !cancelado && setError(e.message));
    return () => { cancelado = true; };
  }, [apiKey]);

  // Ya posicionadas: referencia visual para orientarse en el terreno.
  useEffect(() => {
    if (!listo || !window.google?.maps?.Marker) return;
    for (const m of otrosRef.current) m.setMap(null);
    otrosRef.current = conCoord
      .filter(u => u.id !== selId)
      .map(u => new window.google.maps.Marker({
        position: { lat: u.lat!, lng: u.lng! },
        map: mapRef.current,
        title: u.edificio ?? "",
        icon: iconoCirculo(window.google.maps, { radio: 6, color: "#94a3b8", opacidad: 0.9 }),
      }));
  }, [conCoord, listo, selId]);

  // Pin arrastrable de la ubicacion en edicion.
  useEffect(() => {
    if (!listo || !window.google?.maps?.Marker) return;
    if (pinRef.current) { pinRef.current.setMap(null); pinRef.current = null; }
    if (!sel) return;

    const pos = pendiente ?? (sel.lat != null ? { lat: sel.lat, lng: sel.lng! } : null);
    if (!pos) return;

    pinRef.current = new window.google.maps.Marker({
      position: pos,
      map: mapRef.current,
      draggable: true,
      title: sel.edificio ?? "",
      icon: iconoCirculo(window.google.maps, { radio: 12, color: colorMarca(), opacidad: 1 }),
    });
    pinRef.current.addListener("dragend", (e: any) => {
      setPendiente({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
  }, [sel, pendiente, listo]);

  /** Centra el mapa en la asociacion elegida para no arrastrar entre ciudades. */
  const claveFiltro = `${socId}|${busqueda}`;
  const paginaN = paginado.clave === claveFiltro ? paginado.n : 1;
  const pagina = visibles.slice(0, PAGINA * paginaN);
  const hayMas = visibles.length > pagina.length;

  /** Nombre de la asociacion de una ubicacion, para el subtitulo gris. */
  function nombreSociedad(id: string | null | undefined) {
    return id ? sociedades.find(x => x.id === id)?.nombre ?? null : null;
  }

  useEffect(() => {
    const node = centinelaRef.current;
    if (!node || !hayMas) return;
    const obs = new IntersectionObserver(
      es => {
        if (es[0]?.isIntersecting) {
          setPaginado(p => ({ clave: claveFiltro, n: (p.clave === claveFiltro ? p.n : 1) + 1 }));
        }
      },
      { root: node.parentElement, rootMargin: "150px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hayMas, claveFiltro]);

  function cambiarSociedad(id: string) {
    setSocId(id);
    setSelId(null);
    setPendiente(null);
    if (!mapRef.current) return;

    const enFoco = id === "todas" ? ubicaciones
      : id === "sin" ? ubicaciones.filter(u => !u.sociedad_id)
      : ubicaciones.filter(u => u.sociedad_id === id);
    const conPunto = enFoco.filter(u => u.lat != null && u.lng != null);

    if (conPunto.length > 0 && window.google?.maps) {
      const b = new window.google.maps.LatLngBounds();
      for (const u of conPunto) b.extend({ lat: u.lat!, lng: u.lng! });
      if (conPunto.length === 1) {
        mapRef.current.setCenter(b.getCenter());
        mapRef.current.setZoom(17);
      } else {
        mapRef.current.fitBounds(b, 60);
      }
      return;
    }
    // Ninguna ubicacion posicionada aun: se usa la coordenada de la asociacion.
    const soc = sociedades.find(x => x.id === id);
    if (soc?.lat != null && soc.lng != null) {
      mapRef.current.panTo({ lat: soc.lat, lng: soc.lng });
      mapRef.current.setZoom(16);
    }
  }

  /** Descarta la ubicacion en edicion y su pin, sin guardar la coordenada. */
  function cancelar() {
    setSelId(null);
    setPendiente(null);
  }

  function elegir(u: UbicacionRef) {
    setSelId(u.id);
    setPendiente(null);
    if (u.lat != null && mapRef.current) {
      mapRef.current.panTo({ lat: u.lat, lng: u.lng! });
      mapRef.current.setZoom(18);
    }
  }

  async function guardar() {
    if (!sel || !pendiente) return;
    setGuardando(true);
    try {
      const sb = createClient();
      const { error } = await sb
        .from("ubicaciones")
        .update({
          lat: pendiente.lat,
          lng: pendiente.lng,
          geo_origen: "manual",
          geo_actualizado_at: new Date().toISOString(),
        })
        .eq("id", sel.id);
      if (error) throw error;
      setPendiente(null);
      setSelId(null);
      onGuardado();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo guardar la coordenada.");
    } finally {
      setGuardando(false);
    }
  }

  if (!apiKey) {
    return <Aviso>Falta <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> en el <code>.env.local</code>.</Aviso>;
  }
  if (error) return <Aviso>{error}</Aviso>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "stretch", height: "100%", minHeight: 520 }}>
      {/* Lista de pendientes */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--surface-1)" }}>
        <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <strong style={{ fontSize: 14, color: "var(--fg-1)" }}>Sin coordenada</strong>
            <span style={{ fontSize: 14, color: "var(--fg-4)" }}>({sinCoord.length})</span>
          </div>
          {/* Mismo desplegable buscable que el resto de la app: el <select>
              nativo no filtra ni pagina, y aca la lista de asociaciones puede
              ser larga. "Todas" es el valor vacio del control. */}
          <div style={{ marginBottom: 6 }}>
            <SearchSelect
              placeholder="Todas las asociaciones"
              emptyLabel="Todas las asociaciones"
              value={socId === "todas" ? "" : socId}
              options={[
                ...sociedades.map(x => ({ id: x.id, label: x.nombre })),
                { id: "sin", label: "(Sin asociación)" },
              ]}
              onChange={v => cambiarSociedad(v || "todas")}
            />
          </div>

          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 8, top: 9, color: "var(--fg-4)" }} />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar ubicación…"
              style={{
                width: "100%", height: 30, padding: "0 8px 0 26px", fontSize: 14,
                border: "1px solid var(--border)", borderRadius: 6, outline: "none",
                background: "var(--surface-1)", color: "var(--fg-1)", boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {visibles.length === 0 && (
            <p style={{ padding: 12, fontSize: 14, color: "var(--fg-3)", margin: 0 }}>
              {sinCoord.length === 0 ? "Todas las ubicaciones tienen coordenada." : "Sin resultados."}
            </p>
          )}
          {pagina.map(u => {
            const activa = u.id === selId;
            return (
              <button
                key={u.id}
                onClick={() => elegir(u)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", textAlign: "left", flexShrink: 0,
                  minHeight: 64, padding: "14px 14px", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)",
                  boxSizing: "border-box",
                  background: activa ? "var(--row-selected)" : "var(--surface-1)",
                  border: `1px solid ${activa ? "var(--brand)" : "var(--border)"}`,
                  borderRadius: "var(--r-lg)",
                  boxShadow: activa ? "inset 3px 0 0 0 var(--brand)" : "none",
                  transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.edificio}
                  </span>
                  {/* La asociacion, en gris, bajo el nombre del edificio:
                      dice de que faena es cada ubicacion sin abrirla. */}
                  {nombreSociedad(u.sociedad_id) && (
                    <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nombreSociedad(u.sociedad_id)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {/* Centinela: al asomarse dibuja la siguiente tanda de 20. */}
          {hayMas && (
            <div ref={centinelaRef} style={{ padding: 12, display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          )}
        </div>
      </div>

      {/* Mapa */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          ref={divRef}
          style={{ width: "100%", flex: 1, minHeight: 400, borderRadius: 8, background: "var(--surface-0)" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, minHeight: 32 }}>
          {sel ? (
            <>
              <MapPin size={15} style={{ color: "#2563eb", flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "var(--fg-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sel.edificio}
                {pendiente && (
                  <span style={{ color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
                    {" · "}{pendiente.lat.toFixed(6)}, {pendiente.lng.toFixed(6)}
                  </span>
                )}
              </span>
              {/* Cancelar suelta la ubicacion elegida y el pin pendiente, para
                  salir sin escribir la coordenada. */}
              <button
                onClick={cancelar}
                disabled={guardando}
                style={{
                  display: "inline-flex", alignItems: "center", height: 32,
                  padding: "0 14px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--surface-1)",
                  color: "var(--fg-2)", cursor: guardando ? "default" : "pointer",
                  fontSize: 14, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!pendiente || guardando}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, height: 32,
                  padding: "0 14px", borderRadius: 6, border: "none", cursor: pendiente ? "pointer" : "default",
                  background: pendiente ? "var(--brand)" : "var(--surface-0)",
                  color: pendiente ? "var(--fg-on-brand)" : "var(--fg-4)",
                  fontSize: 14, fontFamily: "inherit",
                }}
              >
                {guardando && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </button>
            </>
          ) : (
            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>
              Elige una ubicación de la lista y haz clic en el mapa para fijar su posición.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16, border: "1px dashed var(--border)", borderRadius: 8,
      fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5,
    }}>{children}</div>
  );
}
