"use client";

import { useEffect, useRef, useState } from "react";
import { Users, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface CuadrillaConMiembros {
  id: string;
  nombre: string;
  color: string | null;
  miembros: string[];
}

/**
 * Atajo para asignar una OT a una cuadrilla entera.
 *
 * WHY THIS EXISTS: asignar de a uno es el trabajo que la cuadrilla venia a
 * ahorrar — si la electrica son seis personas, son seis clics cada vez.
 *
 * DELIBERADAMENTE no guarda la cuadrilla en la OT: expande sus miembros dentro
 * de `asignados_ids` y ahi termina su trabajo. Es una decision, no una
 * simplificacion:
 *
 *  - Una OT necesita responsables concretos al cerrarse. La cuadrilla es el
 *    despacho ("que este grupo lo tome"), no la responsabilidad final.
 *  - Todo lo que ya lee `asignados_ids` — push, la app movil, las RLS, los
 *    filtros de la bandeja — sigue viendo una lista de personas y no hay que
 *    tocar nada. Guardar un `cuadrilla_id` aparte obligaria a que cada uno de
 *    esos consumidores lo entendiera, o los asignados desaparecerian sin ruido.
 *  - Si alguien entra o sale de la cuadrilla despues, la OT ya emitida no
 *    cambia sola, que es lo correcto: quien quedo a cargo quedo a cargo.
 */
export default function CuadrillaQuickAdd({ wsId, onAdd }: {
  wsId: string | null | undefined;
  /** Recibe los ids de los miembros; el padre los une a los ya asignados. */
  onAdd: (usuarioIds: string[]) => void;
}) {
  const PAGINA = 20;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cuadrillas, setCuadrillas] = useState<CuadrillaConMiembros[]>([]);
  const [cargado, setCargado] = useState(false);
  // La tanda se guarda junto a la clave del filtro y se descarta durante el
  // render: un efecto con setState dispararia un segundo render.
  const [paginado, setPaginado] = useState({ clave: "", n: 1 });
  const ref = useRef<HTMLDivElement>(null);
  const centinelaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Se cargan al abrir y no al montar: la mayoria de las OTs se crean sin tocar
  // esto, y el panel de creacion ya hace varias consultas al abrirse.
  useEffect(() => {
    if (!open || cargado || !wsId) return;
    let vivo = true;
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from("cuadrillas")
        .select("id, nombre, color, cuadrilla_usuarios(usuario_id)")
        .eq("workspace_id", wsId)
        .eq("activo", true)
        .order("nombre");
      if (!vivo) return;
      setCuadrillas((data ?? []).map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        color: c.color ?? null,
        miembros: (c.cuadrilla_usuarios ?? []).map((m: any) => m.usuario_id),
      })));
      setCargado(true);
    })();
    return () => { vivo = false; };
  }, [open, cargado, wsId]);

  const q = query.trim().toLowerCase();
  const filtradas = cuadrillas.filter(c => !q || c.nombre.toLowerCase().includes(q));
  const clave = `${query}|${open}`;
  const n = paginado.clave === clave ? paginado.n : 1;
  const mostradas = filtradas.slice(0, PAGINA * n);
  const hayMas = filtradas.length > mostradas.length;

  useEffect(() => {
    const node = centinelaRef.current;
    if (!node || !hayMas || !open) return;
    const obs = new IntersectionObserver(
      es => {
        if (es[0]?.isIntersecting) {
          setPaginado(p => ({ clave, n: (p.clave === clave ? p.n : 1) + 1 }));
        }
      },
      { root: node.parentElement, rootMargin: "80px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hayMas, open, clave]);

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 8 }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(""); }}
        style={{
          height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14, color: "var(--fg-4)",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <Users size={13} />
        Asignar una cuadrilla
        <ChevronDown size={12} style={{ color: "var(--fg-4)", marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          minWidth: 260, background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          {/* Buscador arriba, como en el desplegable de tecnicos. */}
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar cuadrilla…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 14, outline: "none", color: "var(--fg-1)",
                fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "4px 0" }}>
            {!cargado && (
              <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)" }}>Cargando…</div>
            )}
            {cargado && filtradas.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)" }}>
                {cuadrillas.length === 0 ? "No hay cuadrillas creadas" : "Sin resultados"}
              </div>
            )}
            {mostradas.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={c.miembros.length === 0}
                onClick={() => { onAdd(c.miembros); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "8px 12px", background: "transparent", border: "none",
                  cursor: c.miembros.length === 0 ? "default" : "pointer",
                  fontFamily: "inherit", textAlign: "left",
                  opacity: c.miembros.length === 0 ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (c.miembros.length) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: c.color ?? "var(--brand)", color: "#fff",
                }}>
                  <Users size={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.nombre}
                </span>
                <span style={{ fontSize: 14, color: "var(--fg-4)", flexShrink: 0 }}>
                  {c.miembros.length === 0 ? "sin miembros" : `${c.miembros.length}`}
                </span>
              </button>
            ))}
            {/* Se dibujan de a 20 y el centinela pide la siguiente tanda. */}
            {hayMas && <div ref={centinelaRef} style={{ height: 1 }} />}
          </div>
        </div>
      )}
    </div>
  );
}
