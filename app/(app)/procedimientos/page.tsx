"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ClipboardCheck, Plus, Search, Loader2, X, Pencil, Trash2,
  CheckCircle2, AlertTriangle, ChevronRight, Shield, Zap,
} from "lucide-react";
import {
  listProcedimientos, archiveProcedimiento,
} from "@/lib/procedimientos-api";
import type { ProcedimientoListItem } from "@/types/procedimientos";

const TIPO_LABEL: Record<string, string> = {
  instruccion: "Instrucción",
  verificacion: "Verificación",
  medicion: "Medición",
  foto: "Foto",
  advertencia: "Advertencia",
  material: "Material",
  firma: "Firma",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--fg-4)", marginBottom: 5, display: "block",
};

export default function ProcedimientosPage() {
  const router = useRouter();
  const [wsId, setWsId] = useState<string | null>(null);
  const [myRol, setMyRol] = useState<string | null>(null);
  const [items, setItems] = useState<ProcedimientoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<ProcedimientoListItem | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!data?.workspace_id) return;
      setWsId(data.workspace_id);
      setMyRol(data.rol);
      const list = await listProcedimientos(data.workspace_id);
      setItems(list);
      setLoading(false);
    }
    load();
  }, []);

  const isAdmin = myRol === "jefe" || myRol === "admin" || myRol === "owner";

  const filtered = items.filter(p => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion?.toLowerCase().includes(q) ?? false) ||
      (p.categoria?.toLowerCase().includes(q) ?? false)
    );
  });

  async function handleArchive(proc: ProcedimientoListItem) {
    setArchiving(proc.id);
    try {
      await archiveProcedimiento(proc.id);
      setItems(prev => prev.filter(p => p.id !== proc.id));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setArchiving(null);
      setConfirmArchive(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-0)" }}>

      {/* Header */}
      <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Procedimientos</h1>
            <p style={{ fontSize: 13, color: "var(--fg-3)", margin: "4px 0 0" }}>
              Plantillas de pasos reutilizables que puedes adjuntar a órdenes de trabajo.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => router.push("/procedimientos/nueva")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 38, padding: "0 16px",
                background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "var(--fg-on-brand)", fontFamily: "inherit",
              }}
            >
              <Plus size={14} />
              Nuevo procedimiento
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ marginTop: 16, marginBottom: 16, position: "relative", maxWidth: 400 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar procedimientos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", height: 36, paddingLeft: 32, paddingRight: search ? 32 : 12,
              border: "1px solid var(--border)", borderRadius: 8, fontSize: 13,
              background: "var(--surface-1)", outline: "none", fontFamily: "inherit", color: "var(--fg-1)",
              boxSizing: "border-box",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2 }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 32px 32px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 240, background: "var(--surface-1)", borderRadius: 12, border: "1px solid var(--border)",
            color: "var(--fg-4)", gap: 8,
          }}>
            <ClipboardCheck size={36} style={{ color: "var(--fg-4)" }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-3)" }}>
              {search ? "Sin resultados" : "No hay procedimientos aún"}
            </div>
            {!search && isAdmin && (
              <div style={{ fontSize: 13, color: "var(--fg-4)" }}>Crea el primero usando el botón de arriba</div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {filtered.map(proc => (
              <ProcCard
                key={proc.id}
                proc={proc}
                isAdmin={isAdmin}
                archiving={archiving === proc.id}
                onEdit={() => router.push(`/procedimientos/${proc.id}/editar`)}
                onArchive={() => setConfirmArchive(proc)}
                onClick={() => router.push(`/procedimientos/${proc.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm archive */}
      {confirmArchive && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-1)", marginBottom: 8 }}>Archivar procedimiento</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 20 }}>
              Se ocultará <strong>{confirmArchive.nombre}</strong> de la biblioteca. Las ejecuciones existentes no se borrarán.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmArchive(null)}
                style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--fg-2)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleArchive(confirmArchive)}
                disabled={archiving === confirmArchive.id}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 8, background: "var(--danger)", color: "var(--fg-on-brand)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
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

function ProcCard({
  proc, isAdmin, archiving, onEdit, onArchive, onClick,
}: {
  proc: ProcedimientoListItem;
  isAdmin: boolean;
  archiving: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--surface-1)", borderRadius: 12,
        border: `1px solid ${hover ? "var(--border-strong)" : "var(--border)"}`,
        boxShadow: hover ? "var(--shadow-sm)" : "var(--shadow-xs)",
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)", marginBottom: 2 }}>{proc.nombre}</div>
          {proc.descripcion && (
            <div style={{ fontSize: 12.5, color: "var(--fg-3)", lineHeight: 1.4, WebkitLineClamp: 2, WebkitBoxOrient: "vertical", display: "-webkit-box", overflow: "hidden" }}>
              {proc.descripcion}
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={onEdit}
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--fg-1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--fg-3)"; }}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onArchive}
              disabled={archiving}
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--fg-3)"; }}
            >
              {archiving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {proc.categoria && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", background: "var(--brand-tint)", borderRadius: 4, padding: "2px 7px" }}>
              {proc.categoria}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>
            {proc.pasos_count ?? 0} paso{(proc.pasos_count ?? 0) !== 1 ? "s" : ""}
          </span>
          {proc.bloquea_cierre_ot && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--warning)", fontWeight: 500 }}>
              <Shield size={11} />
              Bloquea cierre
            </span>
          )}
          {proc.auto_adjuntar && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--brand)", fontWeight: 500 }}>
              <Zap size={11} />
              Auto-adjuntar
            </span>
          )}
        </div>
        <ChevronRight size={14} style={{ color: "var(--fg-4)" }} />
      </div>
    </div>
  );
}
