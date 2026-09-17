"use client";

/**
 * /automatizaciones — las reglas "si el medidor marca X, haz Y".
 *
 * Reemplaza los umbrales soldados que vivían dentro de la ficha del medidor
 * (advertencia / crítico / intervalo_ot): eso era una regla por medidor y sin
 * historial. Acá la regla es un objeto propio, se puede pausar, y cada vez que
 * el motor la evalúa deja una fila en `automatizacion_ejecuciones`.
 *
 * Master-detail idéntico a /medidores: lista de 380px redimensionable con el
 * ancho persistido, detalle a la derecha, `?id=` en la URL. No inventa layout.
 *
 * Gate de plan: solo Empresa (`plan_features.automatizaciones`). El item del
 * sidebar ya se oculta, pero un enlace guardado entraría igual.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Workflow, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useDeepLinkId } from "@/lib/use-deep-link-id";
import {
  deleteAutomatizacion, fetchAutomatizaciones,
  type AutomatizacionCompleta,
} from "@/lib/automatizaciones-api";
import { fetchMedidores, type MedidorConUltima } from "@/lib/medidores-api";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import AutomatizacionDetalle from "@/components/automatizaciones/AutomatizacionDetalle";
import AutomatizacionCrearPanel from "@/components/automatizaciones/AutomatizacionCrearPanel";
import { listCategorias } from "@/lib/categorias-api";
import { useUsuarios } from "@/lib/queries";
import type { CategoriaOT, Usuario } from "@/types/ordenes";

// Misma división que /medidores, con su propia clave: el ancho cómodo para una
// lista de reglas no es el mismo que para una lista de medidores.
const LIST_WIDTH_KEY = "automatizaciones:listWidth";
const DEFAULT_LIST_WIDTH = 380;
const MIN_LIST_WIDTH = 300;
const MIN_DETAIL_WIDTH = 480;

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AutomatizacionesPage() {
  const suscripcion = useSuscripcion();
  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.automatizaciones) {
    return (
      <UpgradePrompt
        variant="card"
        title="Las automatizaciones están disponibles en Empresa"
        description="Deja escrita la regla una vez —si este medidor pasa de tal valor, abre esta orden de trabajo asignada a esta persona— y el sistema la aplica solo, con el registro de cada vez que actuó."
        upgradeTo="Empresa"
      />
    );
  }
  return <AutomatizacionesPageInner />;
}

function AutomatizacionesPageInner() {
  const queryClient = useQueryClient();
  const [wsId, setWsId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { selectedId, open, close } = useDeepLinkId("/automatizaciones");
  const [creando, setCreando] = useState(false);
  /** En edición: el mismo panel con los valores cargados. */
  const [editando, setEditando] = useState<AutomatizacionCompleta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [listWidth, setListWidth] = useState<number>(DEFAULT_LIST_WIDTH);
  const [resizing, setResizing] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  // El ancho guardado se lee en un efecto: tocar localStorage durante el render
  // rompe la hidratación (el servidor no lo tiene).
  useEffect(() => {
    queueMicrotask(() => {
      const guardado = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
      if (Number.isFinite(guardado) && guardado >= MIN_LIST_WIDTH) setListWidth(guardado);
    });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const max = Math.max(MIN_LIST_WIDTH, rect.width - MIN_DETAIL_WIDTH);
      setListWidth(Math.round(Math.min(Math.max(e.clientX - rect.left, MIN_LIST_WIDTH), max)));
    };
    const onUp = () => setResizing(false);

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
    queryKey: ["automatizaciones", wsId],
    queryFn: () => fetchAutomatizaciones(wsId!),
    enabled: !!wsId,
  });

  // Los medidores se traen acá y no dentro del detalle: la ficha necesita el
  // nombre y la unidad de cada disparador, y pedirlos por automatización serían
  // N consultas de la misma lista.
  const medidoresQuery = useQuery({
    queryKey: ["medidores", "lista", wsId],
    queryFn: () => fetchMedidores(wsId!),
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });
  const medidores: MedidorConUltima[] = useMemo(() => medidoresQuery.data ?? [], [medidoresQuery.data]);

  // Catálogos que consume el constructor: activos y ubicaciones para la OT que
  // la acción deja preparada. Una sola consulta con las dos porque son dos
  // listas chicas y separarlas solo duplica el manejo de carga.
  const catalogos = useQuery({
    queryKey: ["automatizaciones", "catalogos", wsId],
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const sb = createClient();
      const [act, ubi] = await Promise.all([
        sb.from("activos").select("id, nombre, numero_serie")
          .eq("workspace_id", wsId!).eq("activo", true)
          .order("nombre", { ascending: true }).limit(500),
        sb.from("ubicaciones").select("id, edificio, detalle")
          .eq("workspace_id", wsId!).eq("activa", true)
          .order("edificio", { ascending: true }).limit(500),
      ]);
      return {
        activos: ((act.data ?? []) as { id: string; nombre: string | null; numero_serie: string | null }[])
          .map(a => ({ id: a.id, label: a.nombre ?? "Sin nombre", sub: a.numero_serie ?? undefined })),
        ubicaciones: ((ubi.data ?? []) as { id: string; edificio: string | null; detalle: string | null }[])
          // Mismo rótulo "edificio · detalle" que el resto de la app.
          .map(u => ({ id: u.id, label: [u.edificio, u.detalle].filter(Boolean).join(" · ") || "Sin nombre" })),
      };
    },
  });

  const usuariosQuery = useUsuarios(wsId);
  // Dados de baja fuera del selector: siguen en la tabla para poder nombrar
  // trabajo viejo, pero no reciben trabajo nuevo.
  const usuarios: Usuario[] = useMemo(
    () => (usuariosQuery.data ?? []).filter(u => !u.deleted_at) as Usuario[],
    [usuariosQuery.data],
  );

  const categoriasQuery = useQuery({
    queryKey: ["categorias", wsId],
    queryFn: () => listCategorias(wsId!),
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });
  const categorias: CategoriaOT[] = useMemo(() => categoriasQuery.data ?? [], [categoriasQuery.data]);

  const items = useMemo(() => query.data ?? [], [query.data]);
  const loading = query.isLoading;
  const listError = query.error ? (query.error as Error).message : null;
  const isAdmin = rol === "admin" || rol === "owner";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      (a.descripcion ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const hayBusqueda = search.trim().length > 0;

  const detalle = useMemo(
    () => filtered.find(a => a.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  // Abrir la primera evita un panel derecho vacío; un id válido que llegue por
  // URL conserva prioridad.
  useEffect(() => {
    if (filtered.length > 0 && !filtered.some(a => a.id === selectedId)) {
      open(filtered[0].id);
    }
  }, [filtered, selectedId, open]);

  async function eliminar(a: AutomatizacionCompleta) {
    if (!confirm(
      `${a.nombre} dejará de ejecutarse y se borrará su historial de ejecuciones.\n\n` +
      `Las órdenes de trabajo que ya creó se conservan.`,
    )) return;
    try {
      await deleteAutomatizacion(a.id);
      close();
      await queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const errorVisible = error ?? listError;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>

      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gridTemplateRows: "38px", alignItems: "start", padding: "9px 20px", minHeight: 56, columnGap: 12 }}>
          <div style={{ position: "relative", width: 320, maxWidth: "100%", gridColumn: 2, gridRow: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar por nombre…"
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

          {isAdmin && (
            <button
              onClick={() => { setEditando(null); setCreando(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit",
                whiteSpace: "nowrap", gridColumn: 3, gridRow: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nueva automatización
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
              icon={<Workflow size={38} strokeWidth={1.4} />}
              title={hayBusqueda ? "Ninguna automatización coincide con la búsqueda" : "Todavía no hay automatizaciones"}
              description="Una automatización vigila un medidor y actúa sola: abre la orden de trabajo en cuanto la lectura cruza el valor que definas."
              onCreate={isAdmin ? () => { setEditando(null); setCreando(true); } : undefined}
              createLabel="Crear la primera"
              hasSearch={hayBusqueda}
            />
          ) : (
            filtered.map(a => (
              <AutomatizacionRow key={a.id} a={a} selected={selectedId === a.id} onOpen={() => open(a.id)} />
            ))
          )}
        </div>

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
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--surface-canvas)" }}>
          {/* El constructor ocupa el panel, no un modal: entre disparadores,
              los campos de la OT y los dos frenos, el formulario es largo. */}
          {(creando || editando) && wsId ? (
            <AutomatizacionCrearPanel
              key={editando?.id ?? "nueva"}
              wsId={wsId}
              inicial={editando}
              medidores={medidores}
              activos={catalogos.data?.activos ?? []}
              ubicaciones={catalogos.data?.ubicaciones ?? []}
              usuarios={usuarios}
              categorias={categorias}
              onClose={() => { setCreando(false); setEditando(null); }}
              onGuardada={() => {
                setCreando(false);
                setEditando(null);
                void queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
              }}
            />
          ) : detalle ? (
            <div style={{ height: "100%", overflowY: "auto" }}>
              <AutomatizacionDetalle
                key={detalle.id}
                automatizacion={detalle}
                medidores={medidores}
                usuarios={usuarios}
                puedeEditar={isAdmin}
                onEditar={() => { setCreando(false); setEditando(detalle); }}
                onEliminar={() => { void eliminar(detalle); }}
              />
            </div>
          ) : (
            <EmptyDetail
              icon={<Workflow size={28} strokeWidth={1.5} />}
              title="Selecciona una automatización"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Fila de la lista: nombre, estado y cuándo actuó por última vez. */
function AutomatizacionRow({ a, selected, onOpen }: {
  a: AutomatizacionCompleta;
  selected: boolean;
  onOpen: () => void;
}) {
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
        <Workflow size={16} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {a.nombre}
        </span>
        <span style={{ display: "block", marginTop: 3, fontSize: 14, color: "var(--fg-3)" }}>
          {a.ultima_ejecucion_at ? `Última ejecución: ${fmtFecha(a.ultima_ejecucion_at)}` : "Sin ejecuciones"}
        </span>
      </span>
      <span style={{
        flexShrink: 0, fontSize: 14, whiteSpace: "nowrap",
        color: a.activa ? "var(--success)" : "var(--fg-4)",
      }}>
        {a.activa ? "Activada" : "Pausada"}
      </span>
    </button>
  );
}
