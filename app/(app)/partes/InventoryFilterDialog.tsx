"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import styles from "./partes.module.css";

type Segment = "materiales" | "ubicaciones";

interface FilterOptionSource {
  id: string;
  nombre?: string;
  edificio?: string;
}

export function InventoryFilterDialog({ segment, locations, materials, selectedId, onSelect, onClose }: {
  segment: Segment;
  locations: FilterOptionSource[];
  materials: FilterOptionSource[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => segment === "materiales"
    ? locations.map(item => ({ id: item.id, label: item.edificio ?? "Ubicación" }))
    : materials.map(item => ({ id: item.id, label: item.nombre ?? "Material" })), [locations, materials, segment]);
  const normalized = query.trim().toLocaleLowerCase("es");
  const filteredOptions = options.filter(option => option.label.toLocaleLowerCase("es").includes(normalized));

  return (
    <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Filtrar inventario">
        <div className={styles.dialogHeader}>
          <div><h2>Filtrar inventario</h2><p>{segment === "materiales" ? "Materiales reservados por ubicación" : "Ubicaciones que contienen un material"}</p></div>
          <button className={styles.iconButton} onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className={styles.filterSearch}>
          <Search size={16} />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={segment === "materiales" ? "Buscar ubicaciones" : "Buscar materiales"} />
          {query && <button onClick={() => setQuery("")} aria-label="Borrar búsqueda"><X size={15} /></button>}
        </div>
        <div className={styles.filterOptions}>
          {!query && <button className={!selectedId ? styles.filterOptionActive : ""} onClick={() => onSelect(null)}><span>Todos</span>{!selectedId && <Check size={17} />}</button>}
          {filteredOptions.map(option => <button key={option.id} className={selectedId === option.id ? styles.filterOptionActive : ""} onClick={() => onSelect(option.id)}><span>{option.label}</span>{selectedId === option.id && <Check size={17} />}</button>)}
          {filteredOptions.length === 0 && <div className={styles.filterEmpty}>No hay resultados para “{query}”.</div>}
        </div>
      </div>
    </div>
  );
}
