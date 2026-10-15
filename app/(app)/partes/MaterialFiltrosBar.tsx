"use client";

import { useState } from "react";
import {
  CircleAlert, Factory, MapPin, Tag, Truck,
} from "lucide-react";
import { Engine } from "@/components/icons/Engine";
import { AddFilterMenu, FiltroMultiple, type OpcionFiltro } from "@/components/filtros/primitivas";

/** Barra de filtros del inventario. Mismas piezas que /ordenes y /proveedores. */

export type EstadoStock = "agotado" | "bajo" | "ok";

export interface FiltrosMateriales {
  stock: EstadoStock[];
  ubicaciones: string[];
  activos: string[];
  proveedores: string[];
  fabricantes: string[];
  categorias: string[];
}

export const FILTROS_VACIOS: FiltrosMateriales = {
  stock: [], ubicaciones: [], activos: [], proveedores: [], fabricantes: [], categorias: [],
};

type Clave = keyof FiltrosMateriales;
export type Opcion = OpcionFiltro;

const META: Record<Clave, { label: string; icon: React.ReactNode }> = {
  stock:       { label: "Stock",       icon: <CircleAlert size={16} /> },
  ubicaciones: { label: "Ubicación",   icon: <MapPin size={16} /> },
  activos:     { label: "Activo",      icon: <Engine size={16} /> },
  proveedores: { label: "Proveedor",   icon: <Truck size={16} /> },
  fabricantes: { label: "Fabricante",  icon: <Factory size={16} /> },
  categorias:  { label: "Categoría",   icon: <Tag size={16} /> },
};
const ORDEN: Clave[] = ["stock", "ubicaciones", "activos", "proveedores", "fabricantes", "categorias"];
// Fabricante y categoría se agregan desde "Añadir filtro": se usan menos.
const VISIBLES_INICIALES: Clave[] = ["stock", "ubicaciones", "activos", "proveedores"];

const STOCK: Opcion[] = [
  { id: "agotado", label: "Agotado" },
  { id: "bajo", label: "Stock bajo" },
  { id: "ok", label: "En stock" },
];

export function MaterialFiltrosBar({ filtros, onChange, opciones }: {
  filtros: FiltrosMateriales;
  onChange: (f: FiltrosMateriales) => void;
  /** Sólo valores que tiene algún material: un filtro sin resultados no sirve. */
  opciones: Record<Exclude<Clave, "stock">, Opcion[]>;
}) {
  const [visibles, setVisibles] = useState<Clave[]>(VISIBLES_INICIALES);
  const set = (k: Clave, v: string[]) => onChange({ ...filtros, [k]: v });
  const quitar = (k: Clave) => {
    set(k, []);
    setVisibles(prev => prev.filter(x => x !== k));
  };
  const disponibles = ORDEN.filter(k => !visibles.includes(k)).map(k => ({ key: k, label: META[k].label }));
  const iconos = Object.fromEntries(ORDEN.map(k => [k, META[k].icon])) as Record<Clave, React.ReactNode>;

  return (
    <>
      {ORDEN.filter(k => visibles.includes(k)).map(k => (
        <FiltroMultiple
          key={k}
          label={META[k].label}
          icon={META[k].icon}
          opciones={k === "stock" ? STOCK : opciones[k]}
          buscable={k !== "stock"}
          seleccion={filtros[k]}
          onChange={v => set(k, v)}
          onRemove={() => quitar(k)}
        />
      ))}
      <AddFilterMenu available={disponibles} icons={iconos} onAdd={k => setVisibles(prev => [...prev, k])} />
    </>
  );
}
