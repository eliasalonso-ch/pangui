"use client";

import { Check, Contact } from "lucide-react";
import {
  OptionRow, OptionList, FilterDropdown, AddFilterMenu, toggle,
} from "@/components/filtros/primitivas";
import {
  FILTER_META_PROV, FILTER_ORDER_PROV,
  type FiltrosProveedor, type FilterKeyProv, type EstadoProveedor,
} from "./filter-registry";

/** Barra de filtros de proveedores. Mismas piezas que /ordenes y /ordenes-compra. */

const ESTADOS: { value: EstadoProveedor; label: string }[] = [
  { value: "activos",    label: "Activos" },
  { value: "archivados", label: "Archivados" },
];

const FILTER_ICONS_PROV: Record<FilterKeyProv, React.ReactNode> = {
  estado:      <Check size={16} />,
  conContacto: <Contact size={16} />,
};

export function ProveedorFiltrosBar({
  filtros, onChange, visibleKeys, onVisibleKeysChange,
}: {
  filtros: FiltrosProveedor;
  onChange: (f: FiltrosProveedor) => void;
  visibleKeys: FilterKeyProv[];
  onVisibleKeysChange: (k: FilterKeyProv[]) => void;
}) {
  const set = (patch: Partial<FiltrosProveedor>) => onChange({ ...filtros, ...patch });

  const removeFilter = (key: FilterKeyProv) => {
    onChange({ ...filtros, ...FILTER_META_PROV[key].clear() });
    onVisibleKeysChange(visibleKeys.filter(k => k !== key));
  };

  const visible = (k: FilterKeyProv) => visibleKeys.includes(k);
  const available = FILTER_ORDER_PROV
    .filter(k => !visibleKeys.includes(k))
    .map(k => ({ key: k, label: FILTER_META_PROV[k].label }));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {visible("estado") && (
        <FilterDropdown
          label="Estado"
          icon={FILTER_ICONS_PROV.estado}
          active={filtros.estado.length > 0}
          count={filtros.estado.length}
          onClear={() => set({ estado: [] })}
          onRemove={() => removeFilter("estado")}
        >
          <OptionList>
            {ESTADOS.map(e => (
              <OptionRow
                key={e.value}
                active={filtros.estado.includes(e.value)}
                onClick={() => set({ estado: toggle(filtros.estado, e.value) })}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>{e.label}</span>
              </OptionRow>
            ))}
          </OptionList>
        </FilterDropdown>
      )}

      {visible("conContacto") && (
        <FilterDropdown
          label="Con contacto"
          icon={FILTER_ICONS_PROV.conContacto}
          active={filtros.conContacto}
          count={filtros.conContacto ? 1 : 0}
          onClear={() => set({ conContacto: false })}
          onRemove={() => removeFilter("conContacto")}
        >
          <OptionList>
            <OptionRow
              active={filtros.conContacto}
              onClick={() => set({ conContacto: !filtros.conContacto })}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>
                Solo con datos de contacto
              </span>
            </OptionRow>
          </OptionList>
        </FilterDropdown>
      )}

      <AddFilterMenu available={available} icons={FILTER_ICONS_PROV} onAdd={k => onVisibleKeysChange([...visibleKeys, k])} />
    </div>
  );
}
