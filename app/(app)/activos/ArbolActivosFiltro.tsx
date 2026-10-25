"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { Checkbox, SinResultados, TokenSearch, toggle } from "@/components/filtros/primitivas";

/**
 * Filtro "Activo padre": el árbol padre → sub-activos, con casilla por nodo.
 *
 * Los sub-activos no salen sueltos en el listado; este filtro es el camino
 * para llegar a uno sin buscarlo por nombre: se despliega el padre, se marca
 * el hijo y aparece en la bandeja.
 *
 * Trabaja sobre los activos que la bandeja ya tiene en memoria (una sola
 * consulta, al día por realtime): pedirlos de nuevo al servidor sería la misma
 * lista dos veces. El scroll infinito es de dibujo: se pintan de a 25 filas.
 */

const POR_TANDA = 25;

type Nodo = { id: string; nombre: string; activo_padre_id?: string | null };
type Fila = { nodo: Nodo; nivel: number; padre?: string };

export default function ArbolActivosFiltro({ activos, value, onChange }: {
  activos: Nodo[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [visibles, setVisibles] = useState(POR_TANDA);
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { hijos, porId } = useMemo(() => {
    const porId = new Map(activos.map(a => [a.id, a]));
    const hijos = new Map<string | null, Nodo[]>();
    for (const a of activos) {
      // Un padre que no está en la lista (dado de baja) no deja al hijo sin
      // camino: cuelga de la raíz.
      const p = a.activo_padre_id && porId.has(a.activo_padre_id) ? a.activo_padre_id : null;
      if (!hijos.has(p)) hijos.set(p, []);
      hijos.get(p)!.push(a);
    }
    for (const l of hijos.values()) l.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    return { hijos, porId };
  }, [activos]);

  const q = texto.trim().toLowerCase();

  const filas = useMemo<Fila[]>(() => {
    // Al buscar, lista plana con el padre al lado: el árbol plegado escondería
    // justo el sub-activo que se está buscando.
    if (q) {
      return activos
        .filter(a => a.nombre.toLowerCase().includes(q))
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
        .map(a => ({ nodo: a, nivel: 0, padre: a.activo_padre_id ? porId.get(a.activo_padre_id)?.nombre : undefined }));
    }
    const out: Fila[] = [];
    const visitar = (n: Nodo, nivel: number) => {
      out.push({ nodo: n, nivel });
      if (abiertos.has(n.id)) for (const h of hijos.get(n.id) ?? []) visitar(h, nivel + 1);
    };
    for (const r of hijos.get(null) ?? []) visitar(r, 0);
    return out;
  }, [q, activos, porId, hijos, abiertos]);

  useEffect(() => {
    if (!menu) return;
    const cerrar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [menu]);

  const descendientes = (id: string): string[] =>
    (hijos.get(id) ?? []).flatMap(h => [h.id, ...descendientes(h.id)]);

  const agregar = (ids: string[]) => onChange([...new Set([...value, ...ids])]);

  return (
    <>
      <TokenSearch
        placeholder="Buscar activo…"
        value={texto}
        onChange={t => { setTexto(t); setVisibles(POR_TANDA); }}
        tokens={value.map(id => ({ key: id, label: porId.get(id)?.nombre ?? "…" }))}
        onRemove={id => onChange(value.filter(x => x !== id))}
        onClearAll={() => onChange([])}
      />
      <div
        onScroll={e => {
          setMenu(null);
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) setVisibles(v => v + POR_TANDA);
        }}
        style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}
      >
        {filas.slice(0, visibles).map(({ nodo, nivel, padre }) => {
          const activa = value.includes(nodo.id);
          const tieneHijos = (hijos.get(nodo.id)?.length ?? 0) > 0;
          const abierto = abiertos.has(nodo.id);
          return (
            <div
              key={nodo.id}
              style={{
                display: "flex", alignItems: "center", gap: 6, minWidth: 0,
                padding: `6px 12px 6px ${8 + nivel * 18}px`,
                background: activa ? "var(--brand-tint)" : "transparent",
              }}
            >
              {tieneHijos && !q ? (
                <button
                  type="button"
                  aria-label={abierto ? `Plegar ${nodo.nombre}` : `Desplegar ${nodo.nombre}`}
                  aria-expanded={abierto}
                  onClick={() => setAbiertos(prev => {
                    const next = new Set(prev);
                    if (next.has(nodo.id)) next.delete(nodo.id); else next.add(nodo.id);
                    return next;
                  })}
                  style={iconoBtn}
                >
                  {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : (
                <span style={{ width: 22, flexShrink: 0 }} />
              )}
              <button
                type="button"
                onClick={() => onChange(toggle(value, nodo.id))}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <span style={{ fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nodo.nombre}</span>
                {padre && <span style={{ fontSize: 14, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>· {padre}</span>}
              </button>
              {tieneHijos && (
                <button
                  type="button"
                  aria-label={`Opciones de ${nodo.nombre}`}
                  onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu(m => m?.id === nodo.id ? null : { id: nodo.id, top: r.bottom + 4, right: window.innerWidth - r.right });
                  }}
                  style={iconoBtn}
                >
                  <MoreHorizontal size={15} />
                </button>
              )}
              <button
                type="button"
                role="checkbox"
                aria-checked={activa}
                aria-label={nodo.nombre}
                onClick={() => onChange(toggle(value, nodo.id))}
                style={{ ...iconoBtn, width: "auto" }}
              >
                <Checkbox checked={activa} />
              </button>
            </div>
          );
        })}
        {filas.length === 0 && <SinResultados />}
      </div>

      {/* Fijo y no absoluto: la lista tiene overflow y lo recortaría. Sigue
          siendo hijo del dropdown en el DOM, así que abrirlo no lo cierra. */}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed", top: menu.top, right: menu.right, zIndex: 300, minWidth: 220,
            background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "var(--shadow-md)", overflow: "hidden",
          }}
        >
          <button type="button" role="menuitem" style={itemMenu}
            onClick={() => { agregar([menu.id]); setMenu(null); }}>
            Seleccionar este activo
          </button>
          <button type="button" role="menuitem" style={{ ...itemMenu, borderTop: "1px solid var(--border)" }}
            onClick={() => { agregar(descendientes(menu.id)); setMenu(null); }}>
            Seleccionar todos los sub-activos
          </button>
        </div>
      )}
    </>
  );
}

const iconoBtn: React.CSSProperties = {
  width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--fg-3)",
};

const itemMenu: React.CSSProperties = {
  display: "block", width: "100%", padding: "10px 14px", textAlign: "left",
  fontSize: 14, color: "var(--fg-1)", background: "var(--surface-1)",
  border: "none", cursor: "pointer", fontFamily: "inherit",
};
