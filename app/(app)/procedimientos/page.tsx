"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import {
  ClipboardCheck, Plus, Search, Loader2, X, FileText, ShieldCheck, Tag,
} from "lucide-react";
import {
  OptionRow, OptionList, FilterDropdown, AddFilterMenu, toggle,
} from "@/components/filtros/primitivas";
import { listProcedimientos, archiveProcedimiento } from "@/lib/procedimientos-api";
import type { ProcedimientoListItem } from "@/types/procedimientos";
import ProcedimientoDetalle from "./ProcedimientoDetalle";

// Master–detail, igual que Órdenes: lista filtrable a la izquierda, detalle a
// la derecha. Reemplaza la grilla de tarjetas, que obligaba a navegar a otra
// página para ver cada procedimiento.

// Filtros con las mismas piezas que /proveedores, /ordenes-compra y /ordenes
// (FilterDropdown + AddFilterMenu). Salen de datos que la fila ya trae, así
// que filtrar no cuesta una consulta.
type Regla = "inicio" | "cierre" | "auto" | "avisa";
interface FiltrosProc { reglas: Regla[]; categorias: string[] }
type FilterKeyProc = keyof FiltrosProc;

const EMPTY_FILTROS: FiltrosProc = { reglas: [], categorias: [] };
const FILTER_ORDER: FilterKeyProc[] = ["reglas", "categorias"];
const FILTER_LABEL: Record<FilterKeyProc, string> = { reglas: "Reglas", categorias: "Categoría" };
const FILTER_ICONS: Record<FilterKeyProc, React.ReactNode> = {
  reglas: <ShieldCheck size={16} />,
  categorias: <Tag size={16} />,
};
const REGLAS: { value: Regla; label: string; cumple: (p: ProcedimientoListItem) => boolean }[] = [
  { value: "inicio", label: "Bloquea inicio",     cumple: p => p.bloquea_inicio },
  { value: "cierre", label: "Bloquea cierre",     cumple: p => p.bloquea_cierre_ot },
  { value: "auto",   label: "Auto-adjuntar",      cumple: p => p.auto_adjuntar },
  { value: "avisa",  label: "Avisa al completar", cumple: p => !!p.notificar_al_completar },
];
const filterKeysStorageKey = (ws: string) => `procedimientos:filtros:${ws}`;

export default function ProcedimientosPage() {
  const router = useRouter();
  const [myRol, setMyRol] = useState<string | null>(null);
  const [items, setItems] = useState<ProcedimientoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [wsId, setWsId] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosProc>(EMPTY_FILTROS);
  const [visibleKeys, setVisibleKeys] = useState<FilterKeyProc[]>(["reglas"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<ProcedimientoListItem | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!data?.workspace_id) return;
      setMyRol(data.rol);
      setWsId(data.workspace_id);
      const list = await listProcedimientos(data.workspace_id);
      setItems(list);
      setLoading(false);
    }
    load();
  }, []);

  // Chips visibles: preferencia por workspace, como en /proveedores. Se lee
  // después de montar porque localStorage no existe en el servidor.
  useEffect(() => {
    if (!wsId) return;
    try {
      const raw = localStorage.getItem(filterKeysStorageKey(wsId));
      const saved = raw ? (JSON.parse(raw) as string[]).filter((k): k is FilterKeyProc => k in FILTER_LABEL) : null;
      if (saved?.length) setVisibleKeys(FILTER_ORDER.filter(k => saved.includes(k)));
    } catch {
      // Preferencia, no datos: si no se puede leer se usan los de siempre.
    }
  }, [wsId]);

  function cambiarVisibleKeys(keys: FilterKeyProc[]) {
    setVisibleKeys(keys);
    if (!wsId) return;
    try { localStorage.setItem(filterKeysStorageKey(wsId), JSON.stringify(keys)); } catch { /* ver arriba */ }
  }

  function quitarFiltro(key: FilterKeyProc) {
    setFiltros(f => ({ ...f, [key]: [] }));
    cambiarVisibleKeys(visibleKeys.filter(k => k !== key));
  }

  const isAdmin = myRol === "jefe" || myRol === "admin" || myRol === "owner";
  const categorias = useMemo(
    () => [...new Set(items.map(p => p.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );
  const hayFiltros = filtros.reglas.length > 0 || filtros.categorias.length > 0;

  const filtered = useMemo(() => items.filter(p => {
    // Reglas: el procedimiento tiene que cumplir todas las elegidas.
    if (!filtros.reglas.every(r => REGLAS.find(x => x.value === r)!.cumple(p))) return false;
    if (filtros.categorias.length && !filtros.categorias.includes(p.categoria ?? "")) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion?.toLowerCase().includes(q) ?? false) ||
      (p.categoria?.toLowerCase().includes(q) ?? false)
    );
  }), [items, search, filtros]);

  async function handleArchive(proc: ProcedimientoListItem) {
    setArchiving(proc.id);
    try {
      await archiveProcedimiento(proc.id);
      setItems(prev => prev.filter(p => p.id !== proc.id));
      if (selectedId === proc.id) setSelectedId(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setArchiving(null);
      setConfirmArchive(null);
    }
  }


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Barra de herramientas igual que /proveedores y /medidores: al tono
          canvas, controles de 38px, búsqueda y acción arriba, filtros debajo. */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gridTemplateRows: "38px 32px", alignItems: "start", padding: "9px 20px", minHeight: 96, columnGap: 12, rowGap: 8 }}>
          <div style={{ position: "relative", width: 320, maxWidth: "100%", gridColumn: 2, gridRow: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar procedimientos…"
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
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ gridColumn: 1, gridRow: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {visibleKeys.includes("reglas") && (
              <FilterDropdown
                label="Reglas"
                icon={FILTER_ICONS.reglas}
                active={filtros.reglas.length > 0}
                count={filtros.reglas.length}
                onClear={() => setFiltros(f => ({ ...f, reglas: [] }))}
                onRemove={() => quitarFiltro("reglas")}
              >
                <OptionList>
                  {REGLAS.map(r => (
                    <OptionRow
                      key={r.value}
                      active={filtros.reglas.includes(r.value)}
                      onClick={() => setFiltros(f => ({ ...f, reglas: toggle(f.reglas, r.value) }))}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>{r.label}</span>
                    </OptionRow>
                  ))}
                </OptionList>
              </FilterDropdown>
            )}
            {visibleKeys.includes("categorias") && (
              <FilterDropdown
                label="Categoría"
                icon={FILTER_ICONS.categorias}
                active={filtros.categorias.length > 0}
                count={filtros.categorias.length}
                onClear={() => setFiltros(f => ({ ...f, categorias: [] }))}
                onRemove={() => quitarFiltro("categorias")}
              >
                <OptionList>
                  {categorias.length === 0 ? (
                    <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-3)" }}>Sin categorías</div>
                  ) : categorias.map(c => (
                    <OptionRow
                      key={c}
                      active={filtros.categorias.includes(c)}
                      onClick={() => setFiltros(f => ({ ...f, categorias: toggle(f.categorias, c) }))}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>{c}</span>
                    </OptionRow>
                  ))}
                </OptionList>
              </FilterDropdown>
            )}
            <AddFilterMenu
              available={FILTER_ORDER.filter(k => !visibleKeys.includes(k)).map(k => ({ key: k, label: FILTER_LABEL[k] }))}
              icons={FILTER_ICONS}
              onAdd={k => cambiarVisibleKeys([...visibleKeys, k])}
            />
          </div>

          {isAdmin && (
            <button
              onClick={() => router.push("/procedimientos/nueva")}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit", whiteSpace: "nowrap", gridColumn: 3, gridRow: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nuevo procedimiento
            </button>
          )}
        </div>
      </div>

      {/* Master–detail */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        {/* Lista */}
        {/* Gap + padding para que cada fila se lea como tarjeta flotando sobre
            el lienzo, igual que la bandeja de Órdenes. */}
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
              icon={<ClipboardCheck size={38} strokeWidth={1.4} />}
              title={
                search || hayFiltros
                  ? "Ningún procedimiento coincide con la búsqueda"
                  : "Todavía no hay procedimientos"
              }
              description="Un procedimiento es la pauta que se sigue al ejecutar un trabajo: sus pasos quedan como checklist dentro de la orden."
              onCreate={isAdmin ? () => router.push("/procedimientos/nueva") : undefined}
              createLabel="Crear el primero"
              hasSearch={!!search || hayFiltros}
            />
          ) : (
            filtered.map(proc => (
              <ProcRow
                key={proc.id}
                proc={proc}
                selected={selectedId === proc.id}
                onSelect={() => setSelectedId(proc.id)}
              />
            ))
          )}
        </div>

        {/* Detalle */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {selectedId ? (
            <ProcedimientoDetalle
              id={selectedId}
              isAdmin={isAdmin}
              onEdit={() => router.push(`/procedimientos/${selectedId}/editar`)}
            />
          ) : (
            <EmptyDetail
              icon={<FileText size={28} strokeWidth={1.5} />}
              title="Selecciona un procedimiento"
            />
          )}
        </div>
      </div>

      {/* Confirm archive */}
      {confirmArchive && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", marginBottom: 8 }}>Archivar procedimiento</div>
            <div style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 20 }}>
              Se ocultará <strong>{confirmArchive.nombre}</strong> de la biblioteca. Las ejecuciones existentes no se borrarán.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmArchive(null)}
                style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", color: "var(--fg-2)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleArchive(confirmArchive)}
                disabled={archiving === confirmArchive.id}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 8, background: "var(--danger)", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
              >
                {archiving === confirmArchive.id ? <Loader2 size={12} className="animate-spin" /> : null}
                Archivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Editar y archivar viven en el panel de detalle, no en la tarjeta: la fila
// sólo selecciona. Forma MaintainX: ícono, nombre y a la derecha la cantidad
// de campos; el resto (categoría, reglas) está en el detalle.
function ProcRow({
  proc, selected, onSelect,
}: {
  proc: ProcedimientoListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const pasos = proc.pasos_count ?? 0;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--surface-1)"; }}
      style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
        minHeight: 72, padding: "14px 16px", borderRadius: "var(--r-lg)", cursor: "pointer",
        border: "1px solid " + (selected ? "var(--brand)" : "var(--border)"),
        background: selected ? "var(--row-selected)" : "var(--surface-1)",
        boxShadow: selected ? "inset 4px 0 0 0 var(--brand)" : "none",
        fontFamily: "inherit", flexShrink: 0,
      }}
    >
      <span style={{
        width: 40, height: 40, borderRadius: "var(--r-md)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--brand-tint)", color: "var(--brand)",
        border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
      }}>
        <ClipboardCheck size={18} />
      </span>
      <span style={{ minWidth: 0, flex: 1, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {proc.nombre}
      </span>
      <span style={{ flexShrink: 0, alignSelf: "flex-end", fontSize: 14, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
        {pasos} {pasos === 1 ? "campo" : "campos"}
      </span>
    </button>
  );
}
