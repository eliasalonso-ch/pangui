"use client";

import {
  Contact, Package, UserRound,
} from "lucide-react";
import { Engine } from "@/components/icons/Engine";
import {
  OptionRow, OptionList, FilterDropdown, AddFilterMenu, FiltroMultiple, type OpcionFiltro,
} from "@/components/filtros/primitivas";
import {
  FILTER_META_PROV, FILTER_ORDER_PROV,
  type FiltrosProveedor, type FilterKeyProv,
} from "./filter-registry";

/** Barra de filtros de proveedores. Mismas piezas que /ordenes y /ordenes-compra. */

const FILTER_ICONS_PROV: Record<FilterKeyProv, React.ReactNode> = {
  conContacto: <Contact size={16} />,
  activos:     <Engine size={16} />,
  materiales:  <Package size={16} />,
  contactos:   <UserRound size={16} />,
};

/** Filtros de lista: activo, material y persona de contacto. */
type ClaveLista = "activos" | "materiales" | "contactos";
const CLAVES_LISTA: ClaveLista[] = ["activos", "materiales", "contactos"];

export function ProveedorFiltrosBar({
  filtros, onChange, visibleKeys, onVisibleKeysChange, opciones,
}: {
  filtros: FiltrosProveedor;
  onChange: (f: FiltrosProveedor) => void;
  visibleKeys: FilterKeyProv[];
  onVisibleKeysChange: (k: FilterKeyProv[]) => void;
  /** Sólo lo que está vinculado a algún proveedor. */
  opciones: Record<ClaveLista, OpcionFiltro[]>;
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

      {CLAVES_LISTA.filter(visible).map(k => (
        <FiltroMultiple
          key={k}
          label={FILTER_META_PROV[k].label}
          icon={FILTER_ICONS_PROV[k]}
          opciones={opciones[k]}
          seleccion={filtros[k]}
          onChange={v => set({ [k]: v })}
          onRemove={() => removeFilter(k)}
        />
      ))}

      <AddFilterMenu available={available} icons={FILTER_ICONS_PROV} onAdd={k => onVisibleKeysChange([...visibleKeys, k])} />
    </div>
  );
}
