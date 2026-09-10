"use client";

import { useState } from "react";
import { Check, Truck, Clock, Package } from "lucide-react";
import {
  OptionRow, TokenSearch, SinResultados, OptionList,
  FilterDropdown, AddFilterMenu, toggle,
} from "@/components/filtros/primitivas";
import { ESTADO_OC_LABELS, ESTADO_OC_COLOR, type EstadoOrdenCompra } from "@/types/ordenes-compra";
import {
  FILTER_META_OC, FILTER_ORDER_OC,
  type FiltrosOC, type FilterKeyOC, type FechaOCPreset,
} from "./filter-registry";

/**
 * Barra de filtros de ordenes de compra.
 *
 * Misma construccion que la de /ordenes: chips con dropdown, "Limpiar" para
 * vaciar valores y papelera para sacar el chip de la barra, y las piezas salen
 * de components/filtros para que las dos barras no se separen con el tiempo.
 */

const ESTADOS_OC = Object.keys(ESTADO_OC_LABELS) as EstadoOrdenCompra[];

const FECHAS: { value: FechaOCPreset; label: string }[] = [
  { value: "hoy",       label: "Hoy" },
  { value: "semana",    label: "Últimos 7 días" },
  { value: "mes",       label: "Último mes" },
  { value: "trimestre", label: "Últimos 3 meses" },
];

const FILTER_ICONS_OC: Record<FilterKeyOC, React.ReactNode> = {
  estados:      <Check size={16} />,
  proveedorIds: <Truck size={16} />,
  fecha:        <Clock size={16} />,
  parteIds:     <Package size={16} />,
};

export function OCFiltrosBar({
  filtros, onChange, proveedores, materiales, visibleKeys, onVisibleKeysChange,
}: {
  filtros: FiltrosOC;
  onChange: (f: FiltrosOC) => void;
  proveedores: { id: string; nombre: string }[];
  materiales: { id: string; nombre: string }[];
  visibleKeys: FilterKeyOC[];
  onVisibleKeysChange: (k: FilterKeyOC[]) => void;
}) {
  const [provSearch, setProvSearch] = useState("");
  const [matSearch, setMatSearch] = useState("");

  const set = (patch: Partial<FiltrosOC>) => onChange({ ...filtros, ...patch });

  const removeFilter = (key: FilterKeyOC) => {
    // Quitar tambien vacia: un filtro escondido que sigue filtrando es un
    // resultado que el usuario no puede explicar.
    onChange({ ...filtros, ...FILTER_META_OC[key].clear() });
    onVisibleKeysChange(visibleKeys.filter(k => k !== key));
  };

  const visible = (k: FilterKeyOC) => visibleKeys.includes(k);
  const available = FILTER_ORDER_OC
    .filter(k => !visibleKeys.includes(k))
    .map(k => ({ key: k, label: FILTER_META_OC[k].label }));

  const provFiltrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(provSearch.toLowerCase()));
  const matFiltrados = materiales.filter(m =>
    m.nombre.toLowerCase().includes(matSearch.toLowerCase()));

  const nombreProv = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? id;
  const nombreMat = (id: string) => materiales.find(m => m.id === id)?.nombre ?? id;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {visible("estados") && (
        <FilterDropdown
          label="Estado"
          icon={FILTER_ICONS_OC.estados}
          active={filtros.estados.length > 0}
          count={filtros.estados.length}
          onClear={() => set({ estados: [] })}
          onRemove={() => removeFilter("estados")}
        >
          <OptionList>
            {ESTADOS_OC.map(e => (
              <OptionRow
                key={e}
                active={filtros.estados.includes(e)}
                onClick={() => set({ estados: toggle(filtros.estados, e) })}
              >
                {/* El punto lleva el color del estado, igual que en la tarjeta:
                    el filtro tiene que verse como la fila que va a devolver. */}
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: ESTADO_OC_COLOR[e],
                }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ESTADO_OC_LABELS[e]}
                </span>
              </OptionRow>
            ))}
          </OptionList>
        </FilterDropdown>
      )}

      {visible("proveedorIds") && (
        <FilterDropdown
          label="Proveedor"
          icon={FILTER_ICONS_OC.proveedorIds}
          active={filtros.proveedorIds.length > 0}
          count={filtros.proveedorIds.length}
          onClear={() => set({ proveedorIds: [] })}
          onRemove={() => removeFilter("proveedorIds")}
        >
          <TokenSearch
            placeholder="Buscar proveedor…"
            value={provSearch}
            onChange={setProvSearch}
            tokens={filtros.proveedorIds.map(id => ({ key: id, label: nombreProv(id) }))}
            onRemove={id => set({ proveedorIds: filtros.proveedorIds.filter(x => x !== id) })}
            onClearAll={() => set({ proveedorIds: [] })}
          />
          <OptionList>
            {provFiltrados.map(p => (
              <OptionRow
                key={p.id}
                active={filtros.proveedorIds.includes(p.id)}
                onClick={() => set({ proveedorIds: toggle(filtros.proveedorIds, p.id) })}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.nombre}
                </span>
              </OptionRow>
            ))}
            {provFiltrados.length === 0 && <SinResultados />}
          </OptionList>
        </FilterDropdown>
      )}

      {visible("fecha") && (
        <FilterDropdown
          label="Fecha de creación"
          icon={FILTER_ICONS_OC.fecha}
          active={filtros.fecha !== null}
          count={filtros.fecha ? 1 : 0}
          onClear={() => set({ fecha: null })}
          onRemove={() => removeFilter("fecha")}
        >
          <div style={{ padding: "6px 0 8px" }}>
            {FECHAS.map(f => (
              <OptionRow
                key={f.value}
                active={filtros.fecha === f.value}
                // Un solo tramo a la vez: dos rangos de fecha juntos no
                // significan nada, asi que volver a elegir el mismo lo apaga.
                onClick={() => set({ fecha: filtros.fecha === f.value ? null : f.value })}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>{f.label}</span>
              </OptionRow>
            ))}
          </div>
        </FilterDropdown>
      )}

      {visible("parteIds") && (
        <FilterDropdown
          label="Material"
          icon={FILTER_ICONS_OC.parteIds}
          active={filtros.parteIds.length > 0}
          count={filtros.parteIds.length}
          onClear={() => set({ parteIds: [] })}
          onRemove={() => removeFilter("parteIds")}
        >
          <TokenSearch
            placeholder="Buscar material…"
            value={matSearch}
            onChange={setMatSearch}
            tokens={filtros.parteIds.map(id => ({ key: id, label: nombreMat(id) }))}
            onRemove={id => set({ parteIds: filtros.parteIds.filter(x => x !== id) })}
            onClearAll={() => set({ parteIds: [] })}
          />
          <OptionList>
            {matFiltrados.map(m => (
              <OptionRow
                key={m.id}
                active={filtros.parteIds.includes(m.id)}
                onClick={() => set({ parteIds: toggle(filtros.parteIds, m.id) })}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.nombre}
                </span>
              </OptionRow>
            ))}
            {matFiltrados.length === 0 && <SinResultados />}
          </OptionList>
        </FilterDropdown>
      )}

      <AddFilterMenu available={available} icons={FILTER_ICONS_OC} onAdd={k => onVisibleKeysChange([...visibleKeys, k])} />
    </div>
  );
}
