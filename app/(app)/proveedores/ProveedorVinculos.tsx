"use client";

import Link from "next/link";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  Package,
} from "lucide-react";
import { Engine } from "@/components/icons/Engine";
import { createClient } from "@/lib/supabase";
import { FieldRow, seccionDetalle } from "@/components/catalogo/PanelCatalogo";
import { MultiSelect } from "@/components/ordenes/CategoriaMultiSelect";

/**
 * Activos y materiales de un proveedor.
 *
 * Sin tablas nuevas: un activo tiene UN proveedor (`activos.proveedor_id`) y un
 * material varios (`material_proveedores`). `partes.proveedor_id` es el campo
 * viejo de uno solo; al desvincular se limpia también, o el material seguiría
 * apareciendo con este proveedor en /partes.
 *
 * La ficha sólo los lista; se vinculan en el formulario y se guardan con el
 * resto al apretar Guardar (Cancelar no deja nada a medias).
 */

interface Item { id: string; nombre: string; detalle: string | null; imagen_url: string | null; href: string }
interface ActivoRow extends Item { proveedor_id: string | null; proveedor_nombre: string | null }
interface MaterialRow extends Item { proveedores: string[] }
interface Datos { activos: ActivoRow[]; materiales: MaterialRow[] }
export interface Seleccion { activos: string[]; materiales: string[] }

const QUERY_KEY = ["proveedor-vinculos"];

async function cargar(): Promise<Datos> {
  const sb = createClient();
  // RLS ya acota al workspace. Son cientos de filas a lo más: se piden una vez
  // y cada ficha filtra en memoria.
  const [a, m] = await Promise.all([
    sb.from("activos").select("id,nombre,numero_serie,imagen_url,proveedor_id,proveedor:proveedores!proveedor_id(nombre)").eq("activo", true).order("nombre"),
    sb.from("partes").select("id,nombre,codigo,imagen_url,proveedor_id,material_proveedores(proveedor_id)").eq("activo", true).order("nombre"),
  ]);
  if (a.error) throw a.error;
  if (m.error) throw m.error;
  return {
    activos: (a.data ?? []).map((r: any) => ({
      id: r.id, nombre: r.nombre, detalle: r.numero_serie, imagen_url: r.imagen_url,
      href: `/activos/activos?id=${encodeURIComponent(r.id)}`,
      proveedor_id: r.proveedor_id, proveedor_nombre: (Array.isArray(r.proveedor) ? r.proveedor[0] : r.proveedor)?.nombre ?? null,
    })),
    materiales: (m.data ?? []).map((r: any) => ({
      id: r.id, nombre: r.nombre, detalle: r.codigo || null, imagen_url: r.imagen_url,
      href: `/partes?material=${encodeURIComponent(r.id)}`,
      proveedores: [...new Set<string>([...(r.material_proveedores ?? []).map((l: any) => l.proveedor_id), ...(r.proveedor_id ? [r.proveedor_id] : [])])],
    })),
  };
}

export function useVinculosProveedor() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: cargar, staleTime: 60_000 });
}

/** Lo que hoy está vinculado al proveedor (vacío si todavía no existe). */
export function seleccionActual(datos: Datos | undefined, proveedorId: string | null): Seleccion {
  if (!datos || !proveedorId) return { activos: [], materiales: [] };
  return {
    activos: datos.activos.filter(a => a.proveedor_id === proveedorId).map(a => a.id),
    materiales: datos.materiales.filter(m => m.proveedores.includes(proveedorId)).map(m => m.id),
  };
}

/** Escribe sólo la diferencia entre lo vinculado hoy y `sel`. Lanza si algo falla. */
async function guardarVinculos(proveedorId: string, sel: Seleccion, datos: Datos | undefined) {
  const sb = createClient();
  const hoy = seleccionActual(datos, proveedorId);
  const nuevos = (a: string[], b: string[]) => a.filter(x => !b.includes(x));
  const ok = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) throw new Error(error.message);
  };

  const activosAgregar = nuevos(sel.activos, hoy.activos);
  const activosQuitar = nuevos(hoy.activos, sel.activos);
  const matAgregar = nuevos(sel.materiales, hoy.materiales);
  const matQuitar = nuevos(hoy.materiales, sel.materiales);

  if (activosAgregar.length) await ok(sb.from("activos").update({ proveedor_id: proveedorId }).in("id", activosAgregar));
  if (activosQuitar.length) await ok(sb.from("activos").update({ proveedor_id: null }).in("id", activosQuitar).eq("proveedor_id", proveedorId));
  if (matAgregar.length) await ok(sb.from("material_proveedores").insert(matAgregar.map(id => ({ parte_id: id, proveedor_id: proveedorId }))));
  if (matQuitar.length) {
    await ok(sb.from("material_proveedores").delete().in("parte_id", matQuitar).eq("proveedor_id", proveedorId));
    await ok(sb.from("partes").update({ proveedor_id: null }).in("id", matQuitar).eq("proveedor_id", proveedorId));
  }
}

/** Guarda contra lo que hay en caché y refresca, también si falla a medias. */
export async function aplicarVinculos(qc: QueryClient, proveedorId: string, sel: Seleccion) {
  try { await guardarVinculos(proveedorId, sel, qc.getQueryData<Datos>(QUERY_KEY)); }
  finally { await qc.invalidateQueries({ queryKey: QUERY_KEY }); }
}

// ── Ficha ─────────────────────────────────────────────────────────────────────

export default function ProveedorVinculos({ proveedorId }: { proveedorId: string }) {
  const { data, isLoading } = useVinculosProveedor();
  if (isLoading) return null;
  return (
    <>
      <Seccion
        titulo="Activos"
        icono={<Engine size={16} />}
        items={(data?.activos ?? []).filter(a => a.proveedor_id === proveedorId)}
        vacio="Ningún activo tiene a este proveedor."
      />
      <Seccion
        titulo="Materiales"
        icono={<Package size={16} />}
        items={(data?.materiales ?? []).filter(m => m.proveedores.includes(proveedorId))}
        vacio="Ningún material se le compra a este proveedor."
      />
    </>
  );
}

function Seccion({ titulo, icono, items, vacio }: {
  titulo: string;
  icono: React.ReactNode;
  items: Item[];
  vacio: string;
}) {
  return (
    <div style={seccionDetalle}>
      <p style={{ fontSize: 14, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>{titulo} ({items.length})</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--fg-4)", margin: 0 }}>{vacio}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 800 }}>
          {items.map(x => (
            <Link
              key={x.id}
              href={x.href}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", marginLeft: -8, borderRadius: 8, fontSize: 14, color: "var(--fg-1)", textDecoration: "none" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--brand)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-1)"; }}
            >
              <Miniatura url={x.imagen_url} icono={icono} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nombre}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Foto del activo/material, o su ícono en un cuadro teñido si no tiene. */
function Miniatura({ url, icono }: { url: string | null; icono: React.ReactNode }) {
  const caja: React.CSSProperties = {
    width: 32, height: 32, flexShrink: 0, borderRadius: 8, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 32px desde R2, next/image no aporta
    return <span style={caja}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></span>;
  }
  return <span style={{ ...caja, background: "var(--brand-tint)", color: "var(--brand)", border: "1px solid var(--border)" }}>{icono}</span>;
}

// ── Formulario ────────────────────────────────────────────────────────────────

/**
 * Dos FieldRow con el mismo MultiSelect que usa la OT. Sin links a las fichas:
 * navegar perdería lo que no se ha guardado.
 */
export function VinculosFormulario({ proveedorId, datos, seleccion, onChange }: {
  proveedorId: string | null;
  datos: Datos | undefined;
  seleccion: Seleccion;
  onChange: (s: Seleccion) => void;
}) {
  const activos = datos?.activos ?? [];
  const opcionesActivos = activos.map(a => ({
    id: a.id,
    label: a.nombre + (a.detalle ? ` (${a.detalle})` : "")
      + (a.proveedor_id && a.proveedor_id !== proveedorId ? ` · hoy: ${a.proveedor_nombre ?? "otro proveedor"}` : ""),
  }));
  const opcionesMateriales = (datos?.materiales ?? []).map(m => ({
    id: m.id, label: m.nombre + (m.detalle ? ` (${m.detalle})` : ""),
  }));

  const cambiarActivos = (ids: string[]) => {
    const robados = activos.filter(a =>
      ids.includes(a.id) && !seleccion.activos.includes(a.id) && a.proveedor_id && a.proveedor_id !== proveedorId);
    if (robados.length && !confirm(`${robados.map(a => a.nombre).join(", ")} ya tiene otro proveedor. ¿Cambiarlo a este?`)) return;
    onChange({ ...seleccion, activos: ids });
  };

  return (
    <>
      <FieldRow icon={<Engine size={16} />} label="Activos">
        <MultiSelect options={opcionesActivos} value={seleccion.activos} onChange={cambiarActivos} vacio="Sin activos" />
      </FieldRow>
      <FieldRow icon={<Package size={16} />} label="Materiales">
        <MultiSelect options={opcionesMateriales} value={seleccion.materiales} onChange={ids => onChange({ ...seleccion, materiales: ids })} vacio="Sin materiales" />
      </FieldRow>
    </>
  );
}
