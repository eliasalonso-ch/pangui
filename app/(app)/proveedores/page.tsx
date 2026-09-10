"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeepLinkId } from "@/lib/use-deep-link-id";
import { createClient } from "@/lib/supabase";
import {
  Plus, Search, X, Loader2, Truck, Pencil, Archive, Mail, Phone, Globe, FileText,
} from "lucide-react";
import {
  listProveedores, getProveedor, createProveedor, updateProveedor,
  archivarProveedor, reactivarProveedor,
} from "@/lib/proveedores-api";
import AuditFooter from "@/components/catalogo/AuditFooter";
import ProveedorFormPanel from "./ProveedorForm";
import { ProveedorFiltrosBar } from "./ProveedorFiltrosBar";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { btnSecundario, btnIcono, seccionDetalle } from "@/components/catalogo/PanelCatalogo";
import {
  EMPTY_FILTROS_PROV, FILTER_ORDER_PROV, FILTER_META_PROV,
  contarFiltrosProv, initialFilterKeysProv, filterKeysStorageKeyProv,
  incluyeInactivos, aplicarFiltrosProv,
  type FiltrosProveedor, type FilterKeyProv,
} from "./filter-registry";
import type { Proveedor, ProveedorForm } from "@/types/proveedores";

// Master-detail igual que Categorias: buscador y accion principal arriba, lista
// a la izquierda, ficha a la derecha.

export default function ProveedoresPage() {
  const queryClient = useQueryClient();
  const [wsId, setWsId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Proveedor | null>(null);
  const [search, setSearch] = useState("");
  const { selectedId, open, close } = useDeepLinkId("/proveedores");
  const [modo, setModo] = useState<"ver" | "crear" | "editar">("ver");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosProveedor>(EMPTY_FILTROS_PROV);
  const [visibleKeys, setVisibleKeys] = useState<FilterKeyProv[]>(() => initialFilterKeysProv(null));

  useEffect(() => {
    let active = true;
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!active) return;
      setWsId(data?.workspace_id ?? null);
      setRol(data?.rol ?? null);
    }
    load();
    return () => { active = false; };
  }, []);

  // Ver el comentario del mismo efecto en /ordenes-compra: localStorage no
  // existe en el servidor, asi que los chips guardados se leen despues de
  // montar y no en el estado inicial.
  useEffect(() => {
    if (!wsId) return;
    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem(filterKeysStorageKeyProv(wsId));
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      // Preferencia, no datos: si no se puede leer se usan los de siempre.
    }
    const activos = FILTER_ORDER_PROV.filter(k => FILTER_META_PROV[k].count(filtros) > 0);
    setVisibleKeys(initialFilterKeysProv(saved, activos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  function cambiarVisibleKeys(keys: FilterKeyProv[]) {
    setVisibleKeys(keys);
    if (!wsId) return;
    try {
      localStorage.setItem(filterKeysStorageKeyProv(wsId), JSON.stringify(keys));
    } catch {
      // Ver arriba.
    }
  }

  /**
   * Lista completa y cacheada.
   *
   * Sin paginar a proposito, como dice listProveedores: son decenas, no miles, y
   * el selector de la orden de compra los necesita todos para buscar. TanStack
   * entra solo por el cache — volver desde el detalle ya no los re-pide.
   *
   * `incluyeInactivos` va en la clave porque cambia lo que pide el servidor:
   * son dos listas distintas, no un filtro sobre la misma.
   */
  const verInactivos = incluyeInactivos(filtros);
  const query = useQuery({
    queryKey: ["proveedores", "lista", verInactivos],
    queryFn: () => listProveedores(verInactivos),
    staleTime: 15 * 60 * 1000,
  });

  const items = query.data ?? [];
  const loading = query.isLoading;
  const listError = query.error ? (query.error as Error).message : null;

  // El detalle se pide aparte porque la lista solo trae lo que se ve en la fila.
  useEffect(() => {
    let active = true;
    if (!selectedId) { setDetalle(null); return; }
    getProveedor(selectedId)
      .then(p => { if (active) setDetalle(p); })
      .catch(e => setError((e as Error).message));
    return () => { active = false; };
  }, [selectedId]);

  const isAdmin = rol === "admin" || rol === "owner";

  const filtered = useMemo(() => {
    const porFiltros = aplicarFiltrosProv(items, filtros);
    const q = search.trim().toLowerCase();
    if (!q) return porFiltros;
    return porFiltros.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.rut ?? "").toLowerCase().includes(q) ||
      (p.contacto ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q));
  }, [items, filtros, search]);

  const hayFiltros = contarFiltrosProv(filtros) > 0;
  const hayBusqueda = search.trim().length > 0;

  // La lista tiene contenido: abrir la primera ficha evita un panel derecho
  // vacio. Un id valido que llegue por URL conserva prioridad.
  useEffect(() => {
    if (modo === "ver" && filtered.length > 0 && !filtered.some(p => p.id === selectedId)) {
      open(filtered[0].id);
    }
  }, [filtered, selectedId, modo, open]);

  async function recargar() {
    await queryClient.invalidateQueries({ queryKey: ["proveedores", "lista"] });
  }

  async function handleCreate(v: ProveedorForm) {
    setGuardando(true); setError(null);
    try {
      const nuevo = await createProveedor(v);
      await recargar();
      open(nuevo.id);
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally { setGuardando(false); }
  }

  async function handleUpdate(v: ProveedorForm) {
    if (!detalle) return;
    setGuardando(true); setError(null);
    try {
      await updateProveedor(detalle.id, v);
      setDetalle(await getProveedor(detalle.id));
      await recargar();
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally { setGuardando(false); }
  }

  async function toggleArchivado(p: Proveedor) {
    const activar = !p.activo;
    if (!activar && !confirm(
      `${p.nombre} dejará de aparecer al crear órdenes de compra, activos o materiales.\n\n` +
      `Las órdenes de compra que ya le apuntan se conservan.`,
    )) return;
    try {
      if (activar) await reactivarProveedor(p.id); else await archivarProveedor(p.id);
      setDetalle(await getProveedor(p.id));
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const errorVisible = error ?? listError;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>

      {/* Barra de herramientas al tono canvas y con controles de 38px, igual
          que /planes y /ordenes: es chrome, no una superficie de contenido. */}
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
              placeholder="Buscar por nombre, RUT o contacto…"
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

          {/* El "Ver archivados" que era un checkbox nativo suelto ahora es el
              filtro de Estado: una sola forma de filtrar en la barra. */}
          <div style={{ gridColumn: 1, gridRow: 2 }}>
          <ProveedorFiltrosBar
            filtros={filtros}
            onChange={setFiltros}
            visibleKeys={visibleKeys}
            onVisibleKeysChange={cambiarVisibleKeys}
          />
          </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => { setModo("crear"); close(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit", whiteSpace: "nowrap", gridColumn: 3, gridRow: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      {errorVisible && (
        <div style={{ flexShrink: 0, padding: "8px 16px", fontSize: 14, background: "var(--danger-bg)", color: "var(--danger)", borderBottom: "1px solid var(--border)" }}>
          {errorVisible}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        <div style={{
          width: 380, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Truck size={38} strokeWidth={1.4} />}
              title={
                hayBusqueda || hayFiltros
                  ? "Ningún proveedor coincide con la búsqueda"
                  : "Todavía no hay proveedores"
              }
              description="Un proveedor guarda a quién se le compra: sus datos de contacto y sus condiciones de pago quedan listos para usarse en una orden de compra."
              onCreate={isAdmin ? () => { setModo("crear"); close(); } : undefined}
              createLabel="Crear el primero"
              hasSearch={hayBusqueda || hayFiltros}
            />
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { open(p.id); setModo("ver"); }}
                onMouseEnter={e => { if (selectedId !== p.id) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { if (selectedId !== p.id) e.currentTarget.style.background = "var(--surface-1)"; }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                  padding: "12px 14px", borderRadius: "var(--r-lg)", cursor: "pointer",
                  border: "1px solid " + (selectedId === p.id ? "var(--brand)" : "var(--border)"),
                  background: selectedId === p.id ? "var(--brand-tint)" : "var(--surface-1)",
                  boxShadow: selectedId === p.id ? "inset 3px 0 0 0 var(--brand)" : "none",
                  fontFamily: "inherit", opacity: p.activo ? 1 : 0.55, flexShrink: 0,
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--brand-tint)", color: "var(--brand)", overflow: "hidden",
                }}>
                  {p.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Truck size={16} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nombre}
                  </span>
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.rut || p.contacto || p.email || "Sin datos de contacto"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--surface-canvas)" }}>
          {modo === "crear" ? (
            <ProveedorFormPanel
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleCreate}
            />
          ) : modo === "editar" && detalle ? (
            <ProveedorFormPanel
              key={detalle.id}
              inicial={detalle}
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleUpdate}
            />
          ) : detalle ? (
            <ProveedorDetalle
              p={detalle}
              isAdmin={isAdmin}
              onEdit={() => setModo("editar")}
              onToggleArchivado={() => toggleArchivado(detalle)}
            />
          ) : (
            <EmptyDetail
              icon={<Truck size={28} strokeWidth={1.5} />}
              title="Selecciona un proveedor"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Un dato del detalle: rotulo arriba, valor abajo, icono en la canaleta. */
function Dato({ icon, label, valor }: { icon?: React.ReactNode; label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "14px 0" }}>
      {/* Canaleta fija de 16px con el icono en azul de marca, igual que el
          FieldRow de los paneles de OT. */}
      <div style={{ width: 16, paddingTop: 3, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75 }}>{valor}</span>
      </div>
    </div>
  );
}

function ProveedorDetalle({ p, isAdmin, onEdit, onToggleArchivado }: {
  p: Proveedor;
  isAdmin: boolean;
  onEdit: () => void;
  onToggleArchivado: () => void;
}) {
  const ubicacion = [p.direccion, p.comuna, p.ciudad].filter(Boolean).join(", ") || null;

  return (
    // Inset de 28px y ancho de 1100, los mismos que OTDetail: antes eran 24 y
    // 720 y el panel se leia mas angosto que el resto de la app.
    <div style={{ padding: "0 28px 76px", width: "100%", boxSizing: "border-box" }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        // La regla pertenece al panel, no al contenido: llega a ambos bordes
        // como las secciones de OTDetail, y el inset solo se aplica al texto.
        marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28,
        paddingTop: 24, paddingBottom: 20, marginBottom: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          width: 48, height: 48, borderRadius: "var(--r-lg)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--brand-tint)", color: "var(--brand)", overflow: "hidden",
        }}>
          {p.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Truck size={22} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 20px y peso 500: el titulo del detalle es lo unico que rompe el
              14px de la pantalla, si no no hay jerarquia. */}
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, overflowWrap: "break-word", wordBreak: "break-word" }}>
            {p.nombre}
          </h1>
          {p.giro && <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "4px 0 0" }}>{p.giro}</p>}
          {!p.activo && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 14, color: "var(--fg-3)", background: "var(--surface-hover)", padding: "2px 8px", borderRadius: "var(--r-sm)" }}>
              Archivado
            </span>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
            <button onClick={onEdit} title="Editar" style={{ ...btnSecundario, background: "var(--brand)", borderColor: "var(--brand)", color: "var(--fg-on-brand)" }}>
              <Pencil size={14} /> Editar
            </button>
            <button onClick={onToggleArchivado} title={p.activo ? "Archivar" : "Reactivar"} style={btnIcono}>
              <Archive size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Los datos ya no van en una grilla rigida de dos columnas: se apilan con
          el ritmo de 14px del FieldRow y la seccion se cierra con una regla. */}
      <div style={seccionDetalle}>
        <Dato icon={<FileText size={16} />} label="RUT" valor={p.rut} />
        <Dato icon={<FileText size={16} />} label="Condiciones de pago" valor={p.condiciones_pago} />
        <Dato icon={<Truck size={16} />} label="Dirección" valor={ubicacion} />
      </div>
      <div style={seccionDetalle}>
        <Dato icon={<Mail size={16} />} label="Correo" valor={p.email} />
        <Dato icon={<Phone size={16} />} label="Teléfono" valor={p.telefono} />
        <Dato icon={<Globe size={16} />} label="Sitio web" valor={p.sitio_web} />
        <Dato icon={<Phone size={16} />} label="Contacto" valor={p.contacto} />
      </div>

      {p.notas && (
        <div style={seccionDetalle}>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>Notas</p>
          <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{p.notas}</p>
        </div>
      )}

      {!p.email && (
        // Sin correo no se le puede mandar la OC, y es el error que mas cuesta
        // descubrir: recien al apretar "Enviar" en la orden.
        <div style={{ fontSize: 14, color: "var(--warning)", background: "var(--warning-bg)", padding: "8px 12px", borderRadius: "var(--r-md)", margin: "16px 0" }}>
          Sin correo no se le pueden enviar órdenes de compra.
        </div>
      )}

      <div style={{ ...seccionDetalle, paddingTop: 20, paddingBottom: 20 }}>
        <AuditFooter creador={p.creador} creadoEn={p.created_at} actualizador={p.actualizador} actualizadoEn={p.updated_at} />
      </div>
    </div>
  );
}
