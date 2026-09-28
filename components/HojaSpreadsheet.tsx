"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Trash2, FileSpreadsheet, X, Copy, Maximize2, Minimize2 } from "lucide-react";
import {
  fetchHojas, fetchFilas, createHoja, updateHoja, deleteHoja,
  createFila, updateFila, deleteFila, COLUMNA_CODIGO,
} from "@/lib/hojas-api";
import type { Hoja, HojaColumna, HojaFila, HojaTipo } from "@/lib/hojas-api";
import { setPendingHojaCopy } from "@/lib/hoja-copy-store";
import { buscarMateriales, tieneCobros } from "@/lib/catalogo-api";
import type { MaterialCatalogo } from "@/lib/catalogo-api";
import { construirCobro, descargarCobro } from "@/lib/cobro-export";

const SHEET_TYPES: { tipo: HojaTipo; title: string; description: string }[] = [
  { tipo: "general", title: "Hoja general", description: "Registra datos libres para trabajos específicos." },
  { tipo: "materiales_usados", title: "Materiales usados", description: "Registra materiales y cantidades utilizadas en la OT." },
  { tipo: "materiales_solicitados", title: "Solicitud de materiales", description: "Registra materiales necesarios para continuar el trabajo." },
  { tipo: "cobro", title: "Cobro", description: "Código del material y cantidad. Los precios los pone la app de cobros." },
];

const COL_WIDTH = 160;
const ROW_NUM_WIDTH = 44;
const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 48;

function genId() {
  return crypto.randomUUID();
}

// ── Cell ──────────────────────────────────────────────────────────────────────

function Cell({
  value, tipo, readOnly, onChange, onBlur, sugerir,
}: {
  value: string;
  tipo: "texto" | "numero";
  readOnly: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  /** Si viene, la celda ofrece autocompletar (columna Código de la hoja de cobro). */
  sugerir?: (texto: string) => Promise<MaterialCatalogo[]>;
}) {
  const [editing, setEditing] = useState(false);
  const [opciones, setOpciones] = useState<MaterialCatalogo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cerrando = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Descarta respuestas viejas: si se teclea rápido, la última pedida manda.
  const pedido = useRef(0);

  /** Lanza la búsqueda del autocompletar (sólo donde `sugerir` viene dado). */
  const buscar = useCallback((texto: string) => {
    if (!sugerir) return;
    if (debounce.current) clearTimeout(debounce.current);
    const mio = ++pedido.current;
    debounce.current = setTimeout(() => {
      sugerir(texto)
        .then(r => { if (mio === pedido.current) setOpciones(r); })
        .catch(() => { if (mio === pedido.current) setOpciones([]); });
    }, 180);
  }, [sugerir]);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function handleChange(v: string) {
    onChange(v);
    buscar(v);
  }

  function handleClick() {
    if (readOnly) return;
    setEditing(true);
    // Con la celda ya escrita, ofrece las coincidencias de entrada.
    buscar(value);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleBlur() {
    // Al hacer clic en una sugerencia el input pierde el foco antes del onMouseDown:
    // se pospone el cierre para no perder la selección.
    setTimeout(() => {
      if (cerrando.current) { cerrando.current = false; return; }
      setEditing(false);
      setOpciones([]);
      onBlur();
    }, 120);
  }

  function elegir(m: MaterialCatalogo) {
    cerrando.current = true;
    onChange(m.codigo);
    setOpciones([]);
    setEditing(false);
    setTimeout(onBlur, 0);
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
      <div style={{ ...cellStyle, position: "relative" }}>
        <input
          ref={inputRef}
          type={tipo === "numero" ? "number" : "text"}
          value={value}
          onChange={e => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === "Enter") {
              if (opciones.length) { elegir(opciones[0]); return; }
              e.currentTarget.blur();
            }
            if (e.key === "Escape") { setOpciones([]); e.currentTarget.blur(); }
          }}
          autoFocus
          style={{
            width: "100%", height: "100%", border: "none", outline: "2px solid var(--brand)",
            outlineOffset: -2, padding: "0 10px", fontSize: 14, fontFamily: "inherit",
            background: "var(--surface-1)", color: "var(--fg-1)", textAlign: tipo === "numero" ? "right" : "left",
            boxSizing: "border-box",
          }}
        />
        {opciones.length > 0 && (
          <div
            style={{
              position: "absolute", top: ROW_HEIGHT, left: 0, zIndex: 40, width: 380,
              maxHeight: 260, overflowY: "auto", background: "var(--surface-1)",
              border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,.18)",
            }}
          >
            {opciones.map(m => (
              <div
                key={m.codigo}
                onMouseDown={() => elegir(m)}
                style={{ padding: "7px 10px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              >
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--brand)" }}>{m.codigo}</div>
                <div style={{ fontSize: 13, color: "var(--fg-1)" }}>{m.descripcion}</div>
                {m.unidad && <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{m.unidad}</div>}
              </div>
            ))}
          </div>
        )}
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
        fontSize: 14,
        color: "var(--fg-1)",
        justifyContent: tipo === "numero" ? "flex-end" : "flex-start",
        userSelect: "none",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {value || <span style={{ color: "var(--fg-4)", fontSize: 14 }}>—</span>}
    </div>
  );
}

// ── Spreadsheet for one sheet ─────────────────────────────────────────────────

function SheetGrid({
  hoja, workspaceId, readOnly, expandido,
  onExportReady,
  onContentSaved,
  onColumnsChanged,
}: {
  hoja: Hoja;
  workspaceId: string;
  readOnly: boolean;
  /** En vista ampliada la grilla ocupa el alto del marco en vez de crecer. */
  expandido?: boolean;
  onExportReady?: (fn: () => void) => void;
  onContentSaved?: (hoja: Hoja) => void;
  // The parent owns the hojas array, so column edits have to be lifted to it.
  // Previously add-column mutated the `hoja` prop in place (and rename/delete/
  // tipo didn't update the UI at all until the sheet was switched).
  onColumnsChanged: (hojaId: string, columnas: HojaColumna[]) => void;
}) {
  // Keyed by sheet id so switching sheets resets rows without a setState-in-
  // effect: a response for a previous sheet is ignored rather than overwriting
  // the current one (the old version could race when switching quickly).
  const [rows, setRows] = useState<{ hojaId: string; filas: HojaFila[] } | null>(null);
  const [localCells, setLocalCells] = useState<Record<string, Record<string, string>>>({});
  const loading = rows?.hojaId !== hoja.id;

  // Autocompletar: sólo en la columna "Código" de una hoja de cobro, y sólo
  // donde la función está habilitada (Electrilam).
  const colCodigoId = useMemo(
    () => (hoja.tipo === "cobro" && tieneCobros(workspaceId)
      ? hoja.columnas.find(c => c.label.trim().toLowerCase() === COLUMNA_CODIGO.toLowerCase())?.id
      : undefined),
    [hoja.tipo, hoja.columnas, workspaceId],
  );
  const sugerirMaterial = useCallback(
    (texto: string) => buscarMateriales(workspaceId, texto),
    [workspaceId],
  );
  // useMemo so the empty-array identity is stable while loading — otherwise
  // every render hands downstream hooks a new [].
  const filas = useMemo(() => (rows?.hojaId === hoja.id ? rows.filas : []), [rows, hoja.id]);

  const setFilas = useCallback((update: HojaFila[] | ((prev: HojaFila[]) => HojaFila[])) => {
    setRows(prev => ({
      hojaId: hoja.id,
      filas: typeof update === "function" ? update(prev?.filas ?? []) : update,
    }));
  }, [hoja.id]);

  useEffect(() => {
    let cancelled = false;
    fetchFilas(hoja.id).then(data => {
      if (!cancelled) setRows({ hojaId: hoja.id, filas: data });
    });
    return () => { cancelled = true; };
  }, [hoja.id]);

  const getCellValue = useCallback((fila: HojaFila, colId: string) => {
    return localCells[fila.id]?.[colId] ?? fila.celdas[colId] ?? "";
  }, [localCells]);

  function handleCellChange(filaId: string, colId: string, value: string) {
    setLocalCells(prev => ({ ...prev, [filaId]: { ...(prev[filaId] ?? {}), [colId]: value } }));
  }

  async function handleCellBlur(fila: HojaFila, colId: string) {
    const local = localCells[fila.id];
    if (!local) return;
    const merged = { ...fila.celdas, ...local };
    await updateFila(fila.id, merged);
    setFilas(prev => prev.map(f => f.id === fila.id ? { ...f, celdas: merged } : f));
    if (Object.values(merged).some(value => String(value).trim().length > 0)) onContentSaved?.(hoja);
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

  // All four column edits follow the same shape: persist, then lift the new
  // columns to the parent so the grid re-renders from state.
  async function saveColumns(newCols: HojaColumna[]) {
    await updateHoja(hoja.id, { columnas: newCols });
    onColumnsChanged(hoja.id, newCols);
  }

  async function handleAddColumn() {
    const label = prompt("Nombre de la columna:");
    if (!label?.trim()) return;
    const newCol: HojaColumna = { id: genId(), label: label.trim(), tipo: "texto" };
    await saveColumns([...hoja.columnas, newCol]);
  }

  async function handleRenameColumn(col: HojaColumna) {
    const label = prompt("Nuevo nombre:", col.label);
    if (!label?.trim()) return;
    await saveColumns(hoja.columnas.map(c => c.id === col.id ? { ...c, label: label.trim() } : c));
  }

  async function handleDeleteColumn(col: HojaColumna) {
    if (!confirm(`¿Eliminar columna "${col.label}"? Los datos se perderán.`)) return;
    await saveColumns(hoja.columnas.filter(c => c.id !== col.id));
  }

  async function handleToggleTipo(col: HojaColumna) {
    await saveColumns(hoja.columnas.map(c =>
      c.id === col.id ? { ...c, tipo: (c.tipo === "texto" ? "numero" : "texto") as "texto" | "numero" } : c
    ));
  }

  // Export to CSV. useCallback so the effect below can depend on it honestly
  // instead of suppressing the lint rule — it changes only when the data does.
  const handleExport = useCallback(() => {
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
  }, [filas, hoja]);

  useEffect(() => {
    onExportReady?.(handleExport);
  }, [handleExport, onExportReady]);

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
    <div style={expandido
      ? { overflow: "auto", flex: 1, minHeight: 0 }   // ocupa el alto del marco
      : { overflowX: "auto", overflowY: "visible" }}>
      <div style={{ width: totalWidth, minWidth: "100%" }}>

        {/* Header row */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)", background: "var(--surface-0)", position: "sticky", top: 0, zIndex: 1 }}>
          <div style={{ width: ROW_NUM_WIDTH, height: HEADER_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>#</span>
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
              {/* Sin textTransform: el label lo escribe el usuario al crear la
                  columna, así que se muestra tal cual lo tipeó. */}
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {col.label}
              </span>
              <span style={{ fontSize: 14, color: "var(--fg-4)" }}>{col.tipo === "numero" ? "123" : "Aa"}</span>
            </div>
          ))}
          {!readOnly && (
            <button
              onClick={handleAddColumn}
              style={{ width: COL_WIDTH, height: HEADER_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", borderLeft: "1px solid var(--border)", background: "var(--surface-0)", cursor: "pointer", fontSize: 14, color: "var(--brand-fg)", fontFamily: "inherit", flexShrink: 0 }}
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
                <span style={{ fontSize: 14, color: "var(--fg-4)" }}>{rowIdx + 1}</span>
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
                sugerir={col.id === colCodigoId ? sugerirMaterial : undefined}
              />
            ))}
            {!readOnly && <div style={{ width: COL_WIDTH, flexShrink: 0 }} />}
          </div>
        ))}

        {/* Add row */}
        {!readOnly && (
          <button
            onClick={handleAddRow}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "var(--surface-1)", border: "none", borderBottom: "1px solid var(--divider)", cursor: "pointer", fontSize: 14, color: "var(--brand-fg)", fontFamily: "inherit", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
          >
            <Plus size={14} /> Agregar fila
          </button>
        )}

        {/* Empty state */}
        {filas.length === 0 && readOnly && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>Sin filas registradas</div>
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
  onSheetContentSaved,
}: {
  workspaceId: string;
  userId: string;
  ordenId: string;
  canEdit: boolean;
  canExport: boolean;
  onSheetContentSaved?: (hoja: Hoja) => void;
}) {
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Vista ampliada: la hoja pasa a ocupar la ventana, para trabajar cómodo.
  const [expandido, setExpandido] = useState(false);

  // Escape cierra la vista ampliada, y mientras está abierta no se scrollea
  // el detalle de la OT por detrás.
  useEffect(() => {
    if (!expandido) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpandido(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expandido]);
  const exportFnRef = useRef<(() => void) | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchHojas(workspaceId, ordenId).then(data => {
      setHojas(data);
      if (data.length > 0) setActiveId(data[0].id);
      setLoading(false);
    });
  }, [workspaceId, ordenId]);

  async function handleCreateSheet(tipo: HojaTipo) {
    if (creating) return;
    setCreating(true);
    try {
      const hoja = await createHoja(workspaceId, tipo, userId, ordenId);
      setHojas(prev => [...prev, hoja]);
      setActiveId(hoja.id);
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
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

  // Stable identities — SheetGrid's export effect depends on onExportReady, so
  // an inline arrow here would re-run it on every parent render.
  const handleExportReady = useCallback((fn: () => void) => { exportFnRef.current = fn; }, []);
  const handleColumnsChanged = useCallback((hojaId: string, columnas: HojaColumna[]) => {
    setHojas(prev => prev.map(h => h.id === hojaId ? { ...h, columnas } : h));
  }, []);

  // Hand the sheet to the Órdenes bandeja and let the user pick the destination
  // there, using the filters/views/search they already know. The bandeja shows a
  // copy banner and performs the copy on the next OT they open.
  function startCopySheet() {
    if (!activeHoja) return;
    setPendingHojaCopy({ hoja: activeHoja, sourceOrdenId: ordenId });
    router.push("/ordenes?copiarHoja=1");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const marco: React.CSSProperties = expandido
    ? {
        // Ocupa la ventana entera: en una hoja de cobro larga, la tabla dentro
        // del detalle de la OT queda demasiado angosta para trabajar.
        position: "fixed", inset: 24, zIndex: 200,
        border: "1px solid var(--border)", borderRadius: 12,
        background: "var(--surface-1)", boxShadow: "0 24px 64px rgba(0,0,0,.28)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }
    : { border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-1)" };

  return (
    <>
    {expandido && (
      <div
        onClick={() => setExpandido(false)}
        style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,.45)" }}
      />
    )}
    <div style={marco}>
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
                fontSize: 14, fontWeight: 400, fontFamily: "inherit", whiteSpace: "nowrap",
                background: h.id === activeId ? "var(--brand)" : "var(--surface-1)",
                borderColor: h.id === activeId ? "var(--brand)" : "var(--border)",
                color: h.id === activeId ? "var(--fg-on-brand)" : "var(--fg-2)",
              }}
            >
              {h.nombre}
              {canEdit && h.id === activeId && (
                <span
                  onClick={e => { e.stopPropagation(); handleDeleteSheet(h); }}
                  style={{ marginLeft: 6, opacity: 0.6, cursor: "pointer", fontSize: 14 }}
                  title="Eliminar hoja"
                >✕</span>
              )}
            </button>
          ))}
          {canEdit && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", color: "var(--brand-fg)", padding: 0 }}
              title="Nueva hoja"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {/* Ampliar / reducir la hoja */}
        <button
          onClick={() => setExpandido(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "var(--fg-2)", fontWeight: 400, fontFamily: "inherit", flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          title={expandido ? "Reducir (Esc)" : "Ampliar la hoja a toda la ventana"}
        >
          {expandido ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {expandido ? "Reducir" : "Ampliar"}
        </button>

        {/* Copy to another OT — the mobile-equivalent of retyping rows by hand */}
        {canEdit && activeHoja && (
          <button
            onClick={startCopySheet}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "var(--fg-2)", fontWeight: 400, fontFamily: "inherit", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            title="Copiar esta hoja a otra OT"
          >
            <Copy size={13} /> Copiar a otra OT
          </button>
        )}

        {/* Exportar cobro: el .json que abre la app local de cobros de Electrilam */}
        {canExport && activeHoja?.tipo === "cobro" && tieneCobros(workspaceId) && (
          <button
            onClick={async () => {
              try {
                descargarCobro(await construirCobro(activeHoja, ordenId));
              } catch (e) {
                alert("No se pudo generar el cobro: " + (e as Error).message);
              }
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#fff", fontWeight: 500, fontFamily: "inherit", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            title="Descarga el archivo que abre la app de cobros con este trabajo ya cargado"
          >
            <Download size={13} /> Exportar cobro
          </button>
        )}

        {/* Export button */}
        {canExport && activeHoja && (
          <button
            onClick={() => exportFnRef.current?.()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--success-bg)", border: "1px solid var(--st-progress-dot)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "var(--success)", fontWeight: 400, fontFamily: "inherit", flexShrink: 0 }}
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
          <span style={{ fontSize: 14, color: "var(--fg-4)" }}>
            Doble clic en encabezado para renombrar · Clic derecho para cambiar tipo o eliminar columna
          </span>
        </div>
      )}

      {/* Empty state — no sheets */}
      {hojas.length === 0 && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-4)" }}>
          <FileSpreadsheet size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 14, margin: "0 0 12px" }}>Sin hojas de cálculo</p>
          {canEdit && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{ padding: "8px 20px", background: "var(--brand)", color: "var(--fg-on-brand)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 400, fontFamily: "inherit" }}
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
          expandido={expandido}
          onExportReady={handleExportReady}
          onContentSaved={onSheetContentSaved}
          onColumnsChanged={handleColumnsChanged}
        />
      )}

      {/* Footer */}
      {activeHoja && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface-0)", display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 14, color: "var(--fg-4)" }}>
            {activeHoja.columnas.length} columna{activeHoja.columnas.length !== 1 ? "s" : ""}
            {" · "}hoja {hojas.findIndex(h => h.id === activeHoja.id) + 1} de {hojas.length}
          </span>
        </div>
      )}

      {createOpen && (
        <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !creating) setCreateOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 800, display: "grid", placeItems: "center", padding: 24, background: "rgba(15,23,42,.45)" }}>
          <div role="dialog" aria-modal="true" aria-label="Crear hoja" style={{ width: "min(480px, 100%)", overflow: "hidden", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: 58, padding: "0 14px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 14, color: "var(--fg-1)" }}>Nueva hoja de cálculo</strong>
              <button type="button" aria-label="Cerrar" disabled={creating} onClick={() => setCreateOpen(false)} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--fg-1)", display: "grid", placeItems: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 10 }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, color: "var(--fg-3)" }}>Selecciona la plantilla que necesitas. Podrás renombrarla después.</p>
              {SHEET_TYPES.filter(o => o.tipo !== "cobro" || tieneCobros(workspaceId)).map(option => (
                <button key={option.tipo} type="button" disabled={creating} onClick={() => handleCreateSheet(option.tipo)} style={{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{option.title}</span>
                  <span style={{ display: "block", marginTop: 3, fontSize: 14, color: "var(--fg-3)" }}>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
