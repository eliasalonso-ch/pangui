"use client";

/**
 * /medidores — sección propia de los puntos de lectura del espacio.
 *
 * Hasta acá los medidores solo existían dentro de la ficha de un activo, así que
 * para ver "qué medidores tengo" o "a cuáles les toca lectura" había que entrar
 * activo por activo. Esta pantalla los junta, que es como se hace la ronda.
 *
 * Master-detail idéntico a /proveedores: misma barra de herramientas al tono
 * canvas con controles de 38px, misma lista de 380px a la izquierda, mismo panel
 * de detalle a la derecha con inset de 28px. No inventa layout propio.
 *
 * Gate de plan: Pro y Empresa (`plan_features.medidores`). El item del sidebar
 * ya se oculta, pero un enlace guardado entraría igual — la ruta se defiende
 * sola, igual que /proveedores.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes, Gauge, Loader2, MapPin, MoreVertical, Pencil, Plus, Search, User, Wifi, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useDeepLinkId } from "@/lib/use-deep-link-id";
import {
  deleteMedidor, fetchMedidores, lecturaVencida, nivelDeLectura, proximaLectura,
  type MedidorConUltima, type NivelLectura,
} from "@/lib/medidores-api";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { btnSecundario, btnIcono, seccionDetalle } from "@/components/catalogo/PanelCatalogo";
import MedidorCrearPanel from "@/components/medidores/MedidorCrearPanel";
import MedidorAnalitica from "@/components/medidores/MedidorAnalitica";
import LecturasHistorial from "@/components/medidores/LecturasHistorial";
import RegistrarLecturaDialog from "@/components/activos/RegistrarLecturaDialog";

// División redimensionable entre la lista y el detalle, igual que /ordenes.
// La clave de localStorage lleva su propio prefijo: el ancho cómodo para una
// bandeja de OT no es el mismo que para una lista de medidores.
const LIST_WIDTH_KEY = "medidores:listWidth";
const DEFAULT_LIST_WIDTH = 380;
const MIN_LIST_WIDTH = 300;
const MIN_DETAIL_WIDTH = 480;

const NIVEL_COLOR: Record<NivelLectura, string> = {
  normal: "var(--success)",
  advertencia: "var(--warning)",
  critico: "var(--danger)",
};

const NIVEL_LABEL: Record<NivelLectura, string> = {
  normal: "Normal",
  advertencia: "Advertencia",
  critico: "Crítico",
};

/**
 * Botón de acción del encabezado: relleno de marca, 34px.
 *
 * Los mismos valores que "Editar" en OTDetail, para que las acciones primarias
 * de una ficha se vean igual en toda la app.
 */
const btnAccion: React.CSSProperties = {
  flexShrink: 0, height: 34, padding: "0 13px",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "var(--brand)", border: "1px solid var(--brand)",
  borderRadius: "var(--r-sm)", cursor: "pointer",
  color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit",
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MedidoresPage() {
  const suscripcion = useSuscripcion();
  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.medidores) {
    return (
      <UpgradePrompt
        variant="card"
        title="Los medidores están disponibles en Pro"
        description="Sube tu plan para seguir la condición de tus activos —vibración, horómetro, consumo— y que una lectura fuera de rango abra la orden de trabajo sola."
        upgradeTo="Pro"
      />
    );
  }
  return <MedidoresPageInner />;
}

function MedidoresPageInner() {
  const queryClient = useQueryClient();
  const [wsId, setWsId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { selectedId, open, close } = useDeepLinkId("/medidores");
  const [creando, setCreando] = useState(false);
  /** Medidor en edición: reusa el panel de alta con los valores cargados. */
  const [editando, setEditando] = useState<MedidorConUltima | null>(null);
  /**
   * Historial de lecturas abierto sobre el panel derecho.
   *
   * Se guarda el ID y no el medidor: con una copia del objeto, cambiar de
   * medidor en la lista dejaba el historial del anterior montado —había que
   * cerrarlo para ver el nuevo—, porque el snapshot no seguía a `selectedId`.
   * Guardando el id, el historial se cierra solo en cuanto la selección cambia.
   */
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState<MedidorConUltima | null>(null);
  /**
   * Lectura que se esta corrigiendo, si la carga se abrio desde "Corregir".
   *
   * Solo lleva valor e id: el dialogo precarga el numero y borra esa fila
   * RECIEN cuando la nueva quedo guardada.
   */
  const [corrigiendo, setCorrigiendo] = useState<{ id: string; valor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Se avanza tras registrar una lectura, para que el gráfico vuelva a pedir su serie. */
  const [tic, setTic] = useState(0);

  // Ancho de la lista, persistido para que sobreviva a la recarga. Se lee
  // acotado: un valor guardado por debajo del mínimo dejaría la lista inservible.
  const [listWidth, setListWidth] = useState<number>(DEFAULT_LIST_WIDTH);
  const [resizing, setResizing] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  // El ancho guardado se lee en un efecto y no en el inicializador: tocar
  // localStorage durante el render rompe la hidratación (el servidor no lo
  // tiene). El `queueMicrotask` saca el setState del cuerpo del efecto, que es
  // lo que pide `react-hooks/set-state-in-effect`.
  useEffect(() => {
    queueMicrotask(() => {
      const guardado = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
      if (Number.isFinite(guardado) && guardado >= MIN_LIST_WIDTH) setListWidth(guardado);
    });
  }, []);

  // Arrastre: seguir el puntero y acotar para que ningún panel colapse.
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const max = Math.max(MIN_LIST_WIDTH, rect.width - MIN_DETAIL_WIDTH);
      setListWidth(Math.round(Math.min(Math.max(e.clientX - rect.left, MIN_LIST_WIDTH), max)));
    };
    const onUp = () => setResizing(false);

    // Sin esto el arrastre selecciona texto de la lista.
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [resizing]);

  useEffect(() => {
    window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return;
      const { data } = await sb
        .from("usuarios")
        .select("workspace_id, rol")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!active || !data) return;
      setWsId(data.workspace_id ?? null);
      setRol(data.rol ?? null);
    })();
    return () => { active = false; };
  }, []);

  const query = useQuery({
    queryKey: ["medidores", "lista", wsId],
    queryFn: () => fetchMedidores(wsId!),
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const loading = query.isLoading;
  const listError = query.error ? (query.error as Error).message : null;

  const isAdmin = rol === "admin" || rol === "owner";

  /**
   * Vencidos primero, después el resto de los manuales, y los automatizados al
   * final: la ronda es el motivo por el que se entra acá. Dentro de cada grupo,
   * alfabético.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const porBusqueda = !q ? items : items.filter(m =>
      m.nombre.toLowerCase().includes(q) ||
      m.unidad.toLowerCase().includes(q) ||
      (m.descripcion ?? "").toLowerCase().includes(q));

    const peso = (m: MedidorConUltima) =>
      m.tipo !== "manual" ? 2 : lecturaVencida(m) ? 0 : 1;

    return [...porBusqueda].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre));
  }, [items, search]);

  const hayBusqueda = search.trim().length > 0;
  const pendientes = useMemo(
    () => items.filter(m => m.tipo === "manual" && lecturaVencida(m)).length,
    [items],
  );

  const detalle = useMemo(
    () => filtered.find(m => m.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  /**
   * El historial solo se muestra si es el del medidor seleccionado.
   *
   * Así la selección manda: elegir otro medidor en la lista vuelve al detalle,
   * sin necesidad de cerrar el historial a mano.
   */
  const historial = historialId != null && historialId === selectedId ? detalle : null;

  // Abrir la primera ficha evita un panel derecho vacío. Un id válido que llegue
  // por URL conserva prioridad — mismo comportamiento que /proveedores.
  useEffect(() => {
    if (filtered.length > 0 && !filtered.some(m => m.id === selectedId)) {
      open(filtered[0].id);
    }
  }, [filtered, selectedId, open]);

  async function recargar() {
    await queryClient.invalidateQueries({ queryKey: ["medidores", "lista"] });
  }

  async function eliminar(m: MedidorConUltima) {
    if (!confirm(
      `${m.nombre} dejará de aparecer y no recibirá más lecturas.\n\n` +
      `El historial de lecturas se conserva.`,
    )) return;
    try {
      await deleteMedidor(m.id);
      close();
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const errorVisible = error ?? listError;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>

      {/* Barra de herramientas al tono canvas y con controles de 38px, igual
          que /proveedores, /planes y /ordenes: es chrome, no contenido. */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gridTemplateRows: "38px 32px", alignItems: "start", padding: "9px 20px", minHeight: 96, columnGap: 12, rowGap: 8 }}>
          <div style={{ display: "contents" }}>
            <div style={{ position: "relative", width: 320, maxWidth: "100%", gridColumn: 2, gridRow: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Buscar por nombre o unidad…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", height: 38, paddingLeft: 34, paddingRight: search ? 32 : 10,
                  border: "1px solid var(--border)", borderRadius: 8,
                  fontSize: 14, fontWeight: 400,
                  background: "var(--surface-1)", outline: "none", fontFamily: "inherit", color: "var(--fg-1)",
                  boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Fila inferior: el recuento de la ronda ocupa el lugar donde
                /proveedores pone su barra de filtros. */}
            <div style={{ gridColumn: 1, gridRow: 2, display: "flex", alignItems: "center" }}>
              {pendientes > 0 && (
                <span style={{ fontSize: 14, color: "var(--warning)" }}>
                  {pendientes === 1
                    ? "1 medidor pendiente de lectura"
                    : `${pendientes} medidores pendientes de lectura`}
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => setCreando(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit", whiteSpace: "nowrap", gridColumn: 3, gridRow: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nuevo medidor
            </button>
          )}
        </div>
      </div>

      {errorVisible && (
        <div style={{ flexShrink: 0, padding: "8px 16px", fontSize: 14, background: "var(--danger-bg)", color: "var(--danger)", borderBottom: "1px solid var(--border)" }}>
          {errorVisible}
        </div>
      )}

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>

        <div style={{
          width: listWidth, flexShrink: 0,
          overflowY: "auto", background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Gauge size={38} strokeWidth={1.4} />}
              title={hayBusqueda ? "Ningún medidor coincide con la búsqueda" : "Todavía no hay medidores"}
              description="Un medidor es un punto de lectura sobre un activo —vibración, horómetro, consumo—. Cuando una lectura cruza el umbral, Pangui abre la orden de trabajo sola."
              onCreate={isAdmin ? () => setCreando(true) : undefined}
              createLabel="Crear el primero"
              hasSearch={hayBusqueda}
            />
          ) : (
            filtered.map(m => <MedidorRow key={m.id} m={m} selected={selectedId === m.id} onOpen={() => open(m.id)} />)
          )}
        </div>

        {/* Separador arrastrable. El doble clic devuelve el ancho por defecto,
            igual que en /ordenes. El filete vive acá y no como `borderRight` de
            la lista, para que la zona de agarre y la línea sean la misma cosa. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar ancho de la lista"
          onMouseDown={() => setResizing(true)}
          onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)}
          style={{
            width: 7, flexShrink: 0, cursor: "col-resize", zIndex: 5,
            marginLeft: -3, marginRight: -3,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent",
          }}
        >
          <div
            style={{
              width: resizing ? 3 : 1, height: "100%",
              background: resizing ? "var(--brand)" : "var(--border)",
              transition: "background 0.12s, width 0.12s",
            }}
            onMouseEnter={e => { if (!resizing) { e.currentTarget.style.background = "var(--border-strong)"; e.currentTarget.style.width = "3px"; } }}
            onMouseLeave={e => { if (!resizing) { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.width = "1px"; } }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--surface-canvas)" }}>
          {/* El alta ocupa el panel, no un modal: el formulario tiene umbrales,
              ronda y mantenimiento por uso, y el automatizado suma un segundo
              paso con el token. Mismo patrón que OTCrearPanel. */}
          {creando && wsId ? (
            <MedidorCrearPanel
              workspaceId={wsId}
              onClose={() => setCreando(false)}
              onCreado={() => { void recargar(); }}
            />
          ) : editando && wsId ? (
            <MedidorCrearPanel
              key={editando.id}
              workspaceId={wsId}
              medidor={editando}
              onClose={() => setEditando(null)}
              onCreado={() => { void recargar(); setTic(t => t + 1); }}
            />
          ) : historial ? (
            <LecturasHistorial
              key={historial.id}
              medidor={historial}
              refrescar={tic}
              puedeEditar={isAdmin}
              onVolver={() => setHistorialId(null)}
              onRegistrar={() => { setCorrigiendo(null); setRegistrando(historial); }}
              onCorregir={(l) => {
                setCorrigiendo({ id: l.id, valor: String(l.valor) });
                setRegistrando(historial);
              }}
              onCambio={() => { void recargar(); setTic(t => t + 1); }}
            />
          ) : detalle ? (
            <div style={{ height: "100%", overflowY: "auto" }}>
              <MedidorDetalle
                key={detalle.id}
                m={detalle}
                isAdmin={isAdmin}
                tic={tic}
                onRegistrar={() => { setCorrigiendo(null); setRegistrando(detalle); }}
                onEditar={() => setEditando(detalle)}
                onVerTodas={() => setHistorialId(detalle.id)}
                onEliminar={() => eliminar(detalle)}
              />
            </div>
          ) : (
            <EmptyDetail
              icon={<Gauge size={28} strokeWidth={1.5} />}
              title="Selecciona un medidor"
            />
          )}
        </div>
      </div>

      {registrando && wsId && (
        <RegistrarLecturaDialog
          medidor={registrando}
          workspaceId={wsId}
          valorInicial={corrigiendo?.valor}
          reemplaza={corrigiendo?.id}
          onClose={() => { setRegistrando(null); setCorrigiendo(null); }}
          // Se relee: la lectura pudo abrir una OT y mover `ultimo_disparo_ot`
          // en la base, así que el estado local ya no es la verdad.
          onRegistrada={() => { void recargar(); setTic(t => t + 1); }}
        />
      )}
    </div>
  );
}

/** Fila de la lista. Mismo formato que la de /proveedores: icono, dos líneas. */
function MedidorRow({ m, selected, onOpen }: {
  m: MedidorConUltima;
  selected: boolean;
  onOpen: () => void;
}) {
  const nivel = m.ultima ? nivelDeLectura(m.ultima.valor, m) : null;
  const vencida = lecturaVencida(m);

  return (
    <button
      onClick={onOpen}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--surface-1)"; }}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        padding: "12px 14px", borderRadius: "var(--r-lg)", cursor: "pointer",
        border: "1px solid " + (selected ? "var(--brand)" : "var(--border)"),
        background: selected ? "var(--row-selected)" : "var(--surface-1)",
        boxShadow: selected ? "inset 3px 0 0 0 var(--brand)" : "none",
        fontFamily: "inherit", flexShrink: 0,
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--brand-tint)", color: "var(--brand)",
      }}>
        <Gauge size={16} />
      </span>
      {/* Dos columnas: a la izquierda dónde está el medidor, a la derecha
          cuándo toca leerlo y en cuánto va. La derecha se alinea al borde para
          que los valores de todas las filas caigan en la misma vertical y se
          puedan comparar de un vistazo. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.nombre}
        </span>
        {m.activo_nombre && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 14, color: "var(--fg-3)", overflow: "hidden" }}>
            <Boxes size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.activo_nombre}</span>
          </span>
        )}
        {m.ubicacion_nombre && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, fontSize: 14, color: "var(--fg-3)", overflow: "hidden" }}>
            <MapPin size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.ubicacion_nombre}</span>
          </span>
        )}
      </span>

      <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, textAlign: "right" }}>
        <span style={{ fontSize: 14, color: vencida ? "var(--warning)" : "var(--fg-3)", whiteSpace: "nowrap" }}>
          {vencida ? "Lectura pendiente" : `Siguiente lectura ${cuandoToca(m)}`}
        </span>
        <span style={{ fontSize: 14, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
          Última lectura:{" "}
          <span style={{ color: nivel ? NIVEL_COLOR[nivel] : "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>
            {m.ultima ? `${m.ultima.valor} ${m.unidad}` : "—"}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Cuándo toca la próxima lectura, en palabras.
 *
 * "Mañana" / "Hoy" en vez de la fecha porque la ronda se piensa en días, no en
 * calendario: quien abre esta lista quiere saber qué le toca ahora, y una fecha
 * obliga a compararla mentalmente contra hoy. Más allá de una semana sí se
 * muestra la fecha, donde el conteo de días deja de ser útil.
 */
function cuandoToca(m: MedidorConUltima): string {
  const prox = proximaLectura(m);
  if (prox == null) return "—";

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(prox); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);

  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias <= 7) return `en ${dias} días`;
  return prox.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Un dato del detalle: rótulo arriba, valor abajo.
 *
 * Sin icono en la canaleta: repetir un glifo azul por cada campo no distingue
 * nada —son todos del mismo medidor— y la columna de color compite con el dato.
 * El rótulo ya dice qué es.
 */
function Dato({ label, valor, color, nota }: {
  label: string;
  valor: string | null;
  /** Tinta del valor. Solo se usa para marcar una lectura fuera de rango. */
  color?: string;
  /** Segunda línea de apoyo: el cuándo, el estado. */
  nota?: string | null;
}) {
  if (!valor) return null;
  return (
    <div style={{ padding: "14px 0" }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-2)", letterSpacing: "0.01em", marginBottom: 6 }}>
        {label}
      </span>
      <span style={{ display: "block", fontSize: 14, color: color ?? "var(--fg-1)", lineHeight: 1.75 }}>{valor}</span>
      {nota && (
        <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.6 }}>{nota}</span>
      )}
    </div>
  );
}

function MedidorDetalle({ m, isAdmin, tic, onRegistrar, onEditar, onVerTodas, onEliminar }: {
  m: MedidorConUltima;
  isAdmin: boolean;
  tic: number;
  onRegistrar: () => void;
  onEditar: () => void;
  onVerTodas: () => void;
  onEliminar: () => void;
}) {
  const nivel = m.ultima ? nivelDeLectura(m.ultima.valor, m) : null;
  const prox = proximaLectura(m);
  const vencida = lecturaVencida(m);
  const [menu, setMenu] = useState(false);

  // `lecturaVencida` ya encapsula la comparación contra el reloj, así que no
  // hace falta leer `Date.now()` acá: la fila de la lista usa exactamente la
  // misma función, y así los dos lugares no pueden discrepar.
  const siguienteLectura = useMemo(() => {
    if (prox == null) return null;
    if (prox.getTime() === 0) return "Pendiente — nunca se ha leído";
    const iso = prox.toISOString();
    return vencida ? `Vencida el ${fmtFecha(iso)}` : fmtFecha(iso);
  }, [prox, vencida]);

  return (
    <div style={{ padding: "0 28px 76px", width: "100%", boxSizing: "border-box" }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28,
        paddingTop: 24, paddingBottom: 20, marginBottom: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, overflowWrap: "break-word", wordBreak: "break-word" }}>
            {m.nombre}
          </h1>
          <p style={{ fontSize: 14, color: "var(--fg-2)", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {m.tipo === "automatizado" ? <Wifi size={13} /> : <User size={13} />}
            {m.tipo === "automatizado" ? "Automatizado" : "Manual"} · {m.unidad}
          </p>
          {lecturaVencida(m) && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 14, color: "var(--warning)", background: "var(--warning-bg)", padding: "2px 8px", borderRadius: "var(--r-sm)" }}>
              Lectura pendiente
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          {/* Solo los manuales: un automatizado recibe su número del gateway, y
              ofrecer cargarlo a mano invita a ensuciar su serie. */}
          {m.tipo === "manual" && (
            <button onClick={onRegistrar} title="Registrar lectura" style={btnAccion}>
              <Plus size={14} /> Registrar lectura
            </button>
          )}
          {isAdmin && (
            <button onClick={onEditar} title="Editar medidor" style={btnAccion}>
              <Pencil size={14} /> Editar
            </button>
          )}
          {/* Eliminar vive en el menú de tres puntos, no suelto en la barra: es
              destructivo y no debe estar a un clic de distancia del botón que se
              aprieta todos los días. */}
          {isAdmin && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenu(v => !v)}
                aria-label="Más acciones"
                style={{
                  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-3)",
                }}
              >
                <MoreVertical size={16} />
              </button>
              {menu && (
                <>
                  <span onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                  <div style={{
                    position: "absolute", right: 0, top: 38, zIndex: 11, minWidth: 170,
                    background: "var(--surface-1)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "var(--shadow-lg)", overflow: "hidden",
                  }}>
                    <button
                      type="button"
                      onClick={() => { setMenu(false); onEliminar(); }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                        border: "none", background: "transparent", cursor: "pointer",
                        fontSize: 14, fontFamily: "inherit", color: "var(--danger)",
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={seccionDetalle}>
        {/* La última lectura va con el resto de los datos y no en un bloque
            grande aparte: el número ya está en la tarjeta de la lista y arriba
            del gráfico, así que repetirlo en cuerpo 32 solo abultaba la ficha. */}
        <Dato
          label="Última lectura"
          valor={m.ultima ? `${m.ultima.valor} ${m.unidad}` : "Sin lecturas registradas"}
          color={nivel && nivel !== "normal" ? NIVEL_COLOR[nivel] : undefined}
          nota={m.ultima ? `${nivel && nivel !== "normal" ? `${NIVEL_LABEL[nivel]} · ` : ""}${fmtFecha(m.ultima.ts)}` : null}
        />
        <Dato label="Descripción" valor={m.descripcion} />
        <Dato
          label="Umbral de advertencia"
          valor={m.advertencia != null ? `${m.advertencia} ${m.unidad}` : null}
        />
        <Dato
          label="Umbral de alarma"
          valor={m.critico != null ? `Sobre ${m.critico} ${m.unidad} se abre una OT de emergencia` : null}
        />
        <Dato
          label="Mantenimiento por uso"
          valor={m.intervalo_ot != null
            ? `Cada ${m.intervalo_ot} ${m.unidad}` +
              (m.ultimo_disparo_ot != null ? ` · último a las ${m.ultimo_disparo_ot} ${m.unidad}` : "")
            : null}
        />
        <Dato
          label="Frecuencia de lectura"
          valor={m.frecuencia_dias != null ? `Cada ${m.frecuencia_dias} días` : null}
        />
        <Dato label="Siguiente lectura" valor={siguienteLectura} />
        {/* El token se muestra siempre, no una sola vez: es lo que el cliente
            viene a buscar cuando reconfigura su gateway. Ver el comentario de
            la columna en la migración. */}
        <Dato label="Token del equipo" valor={m.token} />
      </div>

      {/* Analítica: la serie en el tiempo, indexada por el instante de la
          medición. Va antes de los datos de configuración porque es lo que se
          viene a mirar. */}
      <div style={seccionDetalle}>
        <MedidorAnalitica medidor={m} refrescar={tic} onVerTodas={onVerTodas} />
      </div>
    </div>
  );
}
