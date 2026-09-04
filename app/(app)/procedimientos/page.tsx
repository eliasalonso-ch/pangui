"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ClipboardCheck, Plus, Search, Loader2, X, Pencil, Trash2, FileText,
  ListFilter, Lock, PlayCircle, Zap, type LucideIcon,
} from "lucide-react";
import { listProcedimientos, archiveProcedimiento } from "@/lib/procedimientos-api";
import type { ProcedimientoListItem } from "@/types/procedimientos";
import ProcedimientoDetalle from "./ProcedimientoDetalle";

// Master–detail, igual que Órdenes: lista filtrable a la izquierda, detalle a
// la derecha. Reemplaza la grilla de tarjetas, que obligaba a navegar a otra
// página para ver cada procedimiento.

type Filtro = "todos" | "cierre" | "inicio" | "auto";

const FILTROS: { key: Filtro; label: string; icon: LucideIcon }[] = [
  { key: "todos",  label: "Todos",           icon: ListFilter },
  { key: "cierre", label: "Bloquean cierre", icon: Lock },
  { key: "inicio", label: "Bloquean inicio", icon: PlayCircle },
  { key: "auto",   label: "Auto-adjuntar",   icon: Zap },
];

export default function ProcedimientosPage() {
  const router = useRouter();
  const [myRol, setMyRol] = useState<string | null>(null);
  const [items, setItems] = useState<ProcedimientoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
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
      const list = await listProcedimientos(data.workspace_id);
      setItems(list);
      setLoading(false);
    }
    load();
  }, []);

  const isAdmin = myRol === "jefe" || myRol === "admin" || myRol === "owner";

  const filtered = useMemo(() => items.filter(p => {
    if (filtro === "cierre" && !p.bloquea_cierre_ot) return false;
    if (filtro === "inicio" && !p.bloquea_inicio) return false;
    if (filtro === "auto"   && !p.auto_adjuntar) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion?.toLowerCase().includes(q) ?? false) ||
      (p.categoria?.toLowerCase().includes(q) ?? false)
    );
  }), [items, search, filtro]);

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

      {/* Toolbar en dos filas, igual que la bandeja de Órdenes: búsqueda y
          acción principal arriba, filtros debajo. Sobre el lienzo, no blanco. */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 8px", justifyContent: "flex-end" }}>
          <div style={{ position: "relative", width: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar procedimientos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", height: 36, paddingLeft: 32, paddingRight: search ? 32 : 12,
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: 14,
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
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {isAdmin && (
            <button
              onClick={() => router.push("/procedimientos/nueva")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px",
                background: "var(--brand)", border: "none", borderRadius: "var(--r-md)", cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={14} />
              Nuevo procedimiento
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px 10px", flexWrap: "wrap" }}>
          {FILTROS.map(f => {
            const active = filtro === f.key;
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                style={{
                  height: 32, padding: "0 11px", borderRadius: "var(--r-md)", cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 400,
                  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                  background: active ? "var(--brand-tint)" : "var(--surface-1)",
                  color: active ? "var(--brand-fg)" : "var(--fg-2)",
                }}
              >
                <Icon size={13} />
                {f.label}
              </button>
            );
          })}
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
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              height: 240, color: "var(--fg-4)", gap: 8, padding: 24, textAlign: "center",
            }}>
              <ClipboardCheck size={32} style={{ color: "var(--fg-4)" }} />
              <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>
                {search || filtro !== "todos" ? "Sin resultados" : "No hay procedimientos aún"}
              </div>
              {!search && filtro === "todos" && isAdmin && (
                <div style={{ fontSize: 14, color: "var(--fg-4)" }}>Crea el primero con el botón de arriba</div>
              )}
            </div>
          ) : (
            filtered.map(proc => (
              <ProcRow
                key={proc.id}
                proc={proc}
                selected={selectedId === proc.id}
                isAdmin={isAdmin}
                archiving={archiving === proc.id}
                onSelect={() => setSelectedId(proc.id)}
                onEdit={() => router.push(`/procedimientos/${proc.id}/editar`)}
                onArchive={() => setConfirmArchive(proc)}
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
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)",
            }}>
              <FileText size={40} style={{ opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>Selecciona un procedimiento</div>
              <div style={{ fontSize: 14 }}>El detalle aparecerá aquí</div>
            </div>
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

function ProcRow({
  proc, selected, isAdmin, archiving, onSelect, onEdit, onArchive,
}: {
  proc: ProcedimientoListItem;
  selected: boolean;
  isAdmin: boolean;
  archiving: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [hover, setHover] = useState(false);
  const pasos = proc.pasos_count ?? 0;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "12px 14px", cursor: "pointer", flexShrink: 0,
        background: selected ? "var(--brand-tint)" : "var(--surface-1)",
        border: `1px solid ${selected ? "var(--brand)" : hover ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {proc.nombre}
          </div>
          <div style={{ fontSize: 14, color: "var(--fg-4)", marginTop: 2 }}>
            {pasos} {pasos === 1 ? "campo" : "campos"}
            {proc.categoria ? ` · ${proc.categoria}` : ""}
          </div>
        </div>
        {isAdmin && hover && (
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={onEdit}
              aria-label="Editar"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onArchive}
              disabled={archiving}
              aria-label="Archivar"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
            >
              {archiving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>
          </div>
        )}
      </div>

      {(proc.bloquea_cierre_ot || proc.bloquea_inicio || proc.auto_adjuntar || proc.notificar_al_completar) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {proc.bloquea_inicio     && <Chip label="Bloquea inicio" color="var(--warning)" />}
          {proc.bloquea_cierre_ot  && <Chip label="Bloquea cierre" color="var(--warning)" />}
          {proc.auto_adjuntar      && <Chip label="Auto-adjuntar" color="var(--brand)" />}
          {proc.notificar_al_completar && <Chip label="Avisa al completar" color="var(--fg-3)" />}
        </div>
      )}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 14, fontWeight: 400, color, border: `1px solid ${color}`,
      borderRadius: 4, padding: "1px 5px", opacity: 0.9, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
