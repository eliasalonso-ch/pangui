"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, Trash2, FileSpreadsheet } from "lucide-react";
import {
  fetchHojas, fetchFilas, createHoja, updateHoja, deleteHoja,
  createFila, updateFila, deleteFila,
} from "@/lib/hojas-api";
import type { Hoja, HojaColumna, HojaFila } from "@/lib/hojas-api";

const COL_WIDTH = 160;
const ROW_NUM_WIDTH = 44;
const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 48;

function genId() {
  return crypto.randomUUID();
}

// ── Cell ──────────────────────────────────────────────────────────────────────

function Cell({
  value, tipo, readOnly, onChange, onBlur,
}: {
  value: string;
  tipo: "texto" | "numero";
  readOnly: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    if (readOnly) return;
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleBlur() {
    setEditing(false);
    onBlur();
  }

  const cellStyle: React.CSSProperties = {
    width: COL_WIDTH,
    height: ROW_HEIGHT,
    borderRight: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
    flexShrink: 0,
    boxSizing: "border-box",
  };

  if (editing) {
    return (
      <div style={cellStyle}>
        <input
          ref={inputRef}
          type={tipo === "numero" ? "number" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          autoFocus
          style={{
            width: "100%", height: "100%", border: "none", outline: "2px solid var(--brand)",
            outlineOffset: -2, padding: "0 10px", fontSize: 13, fontFamily: "inherit",
            background: "var(--surface-1)", color: "var(--fg-1)", textAlign: tipo === "numero" ? "right" : "left",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      title={value}
      style={{
        ...cellStyle,
        padding: "0 10px",
        cursor: readOnly ? "default" : "text",
        fontSize: 13,
        color: "var(--fg-1)",
        justifyContent: tipo === "numero" ? "flex-end" : "flex-start",
        userSelect: "none",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {value || <span style={{ color: "var(--fg-4)", fontSize: 12 }}>—</span>}
    </div>
  );
}

// ── Spreadsheet for one sheet ─────────────────────────────────────────────────

function SheetGrid({
  hoja, workspaceId, readOnly,
  onExportReady,
}: {
  hoja: Hoja;
  workspaceId: string;
  readOnly: boolean;
  onExportReady?: (fn: () => void) => void;
}) {
  const [filas, setFilas] = useState<HojaFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [localCells, setLocalCells] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    setLoading(true);
    fetchFilas(hoja.id).then(data => { setFilas(data); setLoading(false); });
  }, [hoja.id]);

  const getCellValue = useCallback((fila: HojaFila, colId: string) => {
    return localCells[fila.id]?.[colId] ?? fila.celdas[colId] ?? "";
  }, [localCells]);

  function handleCellChange(filaId: string, colId: string, value: string) {
    setLocalCells(prev => ({ ...prev, [filaId]: { ...(prev[filaId] ?? {}), [colId]: value } }));
  }

  function handleCellBlur(fila: HojaFila, colId: string) {
    const local = localCells[fila.id];
    if (!local) return;
    const merged = { ...fila.celdas, ...local };
    updateFila(fila.id, merged);
    setFilas(prev => prev.map(f => f.id === fila.id ? { ...f, celdas: merged } : f));
  }

  async function handleAddRow() {
    const orden = filas.length > 0 ? Math.max(...filas.map(f => f.orden)) + 1 : 0;
    const newFila = await createFila(hoja.id, workspaceId, orden);
    setFilas(prev => [...prev, newFila]);
  }

  async function handleDeleteRow(fila: HojaFila) {
    if (!confirm("¿Eliminar esta fila?")) return;
    await deleteFila(fila.id);
    setFilas(prev => prev.filter(f => f.id !== fila.id));
  }

  async function handleAddColumn() {
    const label = prompt("Nombre de la columna:");
    if (!label?.trim()) return;
    const newCol: HojaColumna = { id: genId(), label: label.trim(), tipo: "texto" };
    const newCols = [...hoja.columnas, newCol];
    await updateHoja(hoja.id, { columnas: newCols });
    hoja.columnas = newCols; // mutate for immediate render — parent refetch handles sync
  }

  async function handleRenameColumn(col: HojaColumna) {
    const label = prompt("Nuevo nombre:", col.label);
    if (!label?.trim()) return;
    const newCols = hoja.columnas.map(c => c.id === col.id ? { ...c, label: label.trim() } : c);
    await updateHoja(hoja.id, { columnas: newCols });
  }

  async function handleDeleteColumn(col: HojaColumna) {
    if (!confirm(`¿Eliminar columna "${col.label}"? Los datos se perderán.`)) return;
    const newCols = hoja.columnas.filter(c => c.id !== col.id);
    await updateHoja(hoja.id, { columnas: newCols });
  }

  async function handleToggleTipo(col: HojaColumna) {
    const newCols = hoja.columnas.map(c =>
      c.id === col.id ? { ...c, tipo: (c.tipo === "texto" ? "numero" : "texto") as "texto" | "numero" } : c
    );
    await updateHoja(hoja.id, { columnas: newCols });
  }

  // Export to CSV
  function handleExport() {
    const cols = hoja.columnas;
    const header = cols.map(c => `"${c.label}"`).join(",");
    const rows = filas.map(fila =>
      cols.map(col => {
        const v = fila.celdas[col.id] ?? "";
        return `"${v.replace(/"/g, '""')}"`;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hoja.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    onExportReady?.(handleExport);
  }, [filas, hoja]);

  const cols = hoja.columnas;
  const totalWidth = ROW_NUM_WIDTH + cols.length * COL_WIDTH + (readOnly ? 0 : COL_WIDTH);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
        <div style={{ width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "visible" }}>
      <div style={{ width: totalWidth, minWidth: "100%" }}>

        {/* Header row */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)", background: "var(--surface-0)", position: "sticky", top: 0, zIndex: 1 }}>
          <div style={{ width: ROW_NUM_WIDTH, height: HEADER_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)" }}>#</span>
          </div>
          {cols.map(col => (
            <div
              key={col.id}
              style={{ width: COL_WIDTH, height: HEADER_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 10px", borderRight: "1px solid var(--border)", flexShrink: 0, cursor: readOnly ? "default" : "pointer" }}
              onDoubleClick={() => !readOnly && handleRenameColumn(col)}
              onContextMenu={e => {
                if (readOnly) return;
                e.preventDefault();
                const action = window.confirm(`Columna "${col.label}"\n\nOK = cambiar tipo (${col.tipo === "texto" ? "Texto → Número" : "Número → Texto"})\nCancelar = eliminar columna`);
                if (action) handleToggleTipo(col);
                else handleDeleteColumn(col);
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-1)", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {col.label}
              </span>
              <span style={{ fontSize: 10, color: "var(--fg-4)" }}>{col.tipo === "numero" ? "123" : "Aa"}</span>
            </div>
          ))}
          {!readOnly && (
            <button
              onClick={handleAddColumn}
              style={{ width: COL_WIDTH, height: HEADER_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", borderLeft: "1px solid var(--border)", background: "var(--surface-0)", cursor: "pointer", fontSize: 12, color: "var(--brand-fg)", fontFamily: "inherit", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-0)"; }}
            >
              <Plus size={14} /> Columna
            </button>
          )}
        </div>

        {/* Data rows */}
        {filas.map((fila, rowIdx) => (
          <div
            key={fila.id}
            style={{ display: "flex", borderBottom: "1px solid var(--divider)", height: ROW_HEIGHT, background: rowIdx % 2 === 0 ? "var(--surface-1)" : "var(--surface-0)", alignItems: "center" }}
          >
            <div style={{ width: ROW_NUM_WIDTH, height: ROW_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--border)", flexShrink: 0 }}>
              {!readOnly ? (
                <button
                  onClick={() => handleDeleteRow(fila)}
                  title="Eliminar fila"
                  style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--fg-4)", padding: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-bg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; e.currentTarget.style.background = "none"; }}
                >
                  <Trash2 size={12} />
                </button>
              ) : (
                <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{rowIdx + 1}</span>
              )}
            </div>
            {cols.map(col => (
              <Cell
                key={col.id}
                value={getCellValue(fila, col.id)}
                tipo={col.tipo}
                readOnly={readOnly}
                onChange={v => handleCellChange(fila.id, col.id, v)}
                onBlur={() => handleCellBlur(fila, col.id)}
              />
            ))}
            {!readOnly && <div style={{ width: COL_WIDTH, flexShrink: 0 }} />}
          </div>
        ))}

        {/* Add row */}
        {!readOnly && (
          <button
            onClick={handleAddRow}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "var(--surface-1)", border: "none", borderBottom: "1px solid var(--divider)", cursor: "pointer", fontSize: 13, color: "var(--brand-fg)", fontFamily: "inherit", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
          >
            <Plus size={14} /> Agregar fila
          </button>
        )}

        {/* Empty state */}
        {filas.length === 0 && readOnly && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>Sin filas registradas</div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HojaSpreadsheet({
  workspaceId,
  userId,
  ordenId,
  canEdit,
  canExport,
}: {
  workspaceId: string;
  userId: string;
  ordenId: string;
  canEdit: boolean;
  canExport: boolean;
}) {
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const exportFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchHojas(workspaceId, ordenId).then(data => {
      setHojas(data);
      if (data.length > 0) setActiveId(data[0].id);
      setLoading(false);
    });
  }, [workspaceId, ordenId]);

  async function handleCreateSheet() {
    const nombre = prompt("Nombre de la hoja:", `Hoja ${hojas.length + 1}`);
    if (!nombre?.trim()) return;
    const hoja = await createHoja(workspaceId, nombre.trim(), userId, ordenId);
    setHojas(prev => [...prev, hoja]);
    setActiveId(hoja.id);
  }

  async function handleDeleteSheet(hoja: Hoja) {
    if (!confirm(`¿Eliminar "${hoja.nombre}" y todas sus filas?`)) return;
    await deleteHoja(hoja.id);
    const remaining = hojas.filter(h => h.id !== hoja.id);
    setHojas(remaining);
    setActiveId(remaining[0]?.id ?? null);
  }

  async function handleRenameSheet(hoja: Hoja) {
    const nombre = prompt("Nuevo nombre:", hoja.nombre);
    if (!nombre?.trim()) return;
    await updateHoja(hoja.id, { nombre: nombre.trim() });
    setHojas(prev => prev.map(h => h.id === hoja.id ? { ...h, nombre: nombre.trim() } : h));
  }

  const activeHoja = hojas.find(h => h.id === activeId) ?? null;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-1)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-0)", gap: 8 }}>
        {/* Sheet tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flex: 1 }}>
          {hojas.map(h => (
            <button
              key={h.id}
              onClick={() => setActiveId(h.id)}
              onDoubleClick={() => canEdit && handleRenameSheet(h)}
              style={{
                padding: "4px 12px", border: "1px solid", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                background: h.id === activeId ? "var(--brand)" : "var(--surface-1)",
                borderColor: h.id === activeId ? "var(--brand)" : "var(--border)",
                color: h.id === activeId ? "var(--fg-on-brand)" : "var(--fg-2)",
              }}
            >
              {h.nombre}
              {canEdit && h.id === activeId && (
                <span
                  onClick={e => { e.stopPropagation(); handleDeleteSheet(h); }}
                  style={{ marginLeft: 6, opacity: 0.6, cursor: "pointer", fontSize: 11 }}
                  title="Eliminar hoja"
                >✕</span>
              )}
            </button>
          ))}
          {canEdit && (
            <button
              onClick={handleCreateSheet}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", color: "var(--brand-fg)", padding: 0 }}
              title="Nueva hoja"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {/* Export button */}
        {canExport && activeHoja && (
          <button
            onClick={() => exportFnRef.current?.()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--success-bg)", border: "1px solid var(--st-progress-dot)", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--success)", fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >
            <Download size={13} /> Exportar .csv
          </button>
        )}
      </div>

      {/* Hint */}
      {canEdit && activeHoja && (
        <div style={{ padding: "6px 14px", background: "var(--surface-0)", borderBottom: "1px solid var(--divider)" }}>
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>
            Doble clic en encabezado para renombrar · Clic derecho para cambiar tipo o eliminar columna
          </span>
        </div>
      )}

      {/* Empty state — no sheets */}
      {hojas.length === 0 && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-4)" }}>
          <FileSpreadsheet size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, margin: "0 0 12px" }}>Sin hojas de cálculo</p>
          {canEdit && (
            <button
              onClick={handleCreateSheet}
              style={{ padding: "8px 20px", background: "var(--brand)", color: "var(--fg-on-brand)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}
            >
              Crear hoja
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {activeHoja && (
        <SheetGrid
          key={activeHoja.id}
          hoja={activeHoja}
          workspaceId={workspaceId}
          readOnly={!canEdit}
          onExportReady={fn => { exportFnRef.current = fn; }}
        />
      )}

      {/* Footer */}
      {activeHoja && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface-0)", display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>
            {activeHoja.columnas.length} columna{activeHoja.columnas.length !== 1 ? "s" : ""}
            {" · "}hoja {hojas.findIndex(h => h.id === activeHoja.id) + 1} de {hojas.length}
          </span>
        </div>
      )}
    </div>
  );
}
