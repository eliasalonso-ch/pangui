"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  menuLabelStyle, menuSeparatorStyle, menuItemStyle, menuTriggerStyle, menuTriggerHover,
} from "@/components/ui/dropdown-menu";

export type GrupoOrden<T extends string> = { label: string; options: { value: T; label: string }[] };

/**
 * Fila "Ordenar por: …" sobre una lista (/activos, /partes). DropdownMenu de
 * shadcn con un submenú por campo; adentro, las dos direcciones. Misma fila y
 * alineación que "Mostrando" en /ordenes: el texto queda a 16px del borde.
 */
export function MenuOrden<T extends string>({ grupos, value, onChange }: {
  grupos: GrupoOrden<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const grupo = grupos.find(g => g.options.some(o => o.value === value));
  const etiqueta = grupo ? `${grupo.label}: ${grupo.options.find(o => o.value === value)!.label}` : "";

  return (
    <div style={{ display: "flex", alignItems: "center", minWidth: 0, padding: "6px 10px", background: "var(--surface-canvas)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" style={menuTriggerStyle} {...menuTriggerHover}>
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>Ordenar por:</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--brand-fg)" }} title={etiqueta}>
              {etiqueta}
            </span>
            <ChevronDown size={14} color="var(--brand-fg)" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" style={{ minWidth: 220, padding: 6 }}>
          <DropdownMenuLabel style={menuLabelStyle}>Ordenar por</DropdownMenuLabel>
          <DropdownMenuSeparator style={menuSeparatorStyle} />
          {grupos.map(g => (
            <DropdownMenuSub key={g.label}>
              <DropdownMenuSubTrigger style={menuItemStyle(g === grupo)}>{g.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent style={{ minWidth: 200, padding: 6 }}>
                <DropdownMenuRadioGroup value={value} onValueChange={v => { onChange(v as T); setOpen(false); }}>
                  {g.options.map(o => (
                    // padding izquierdo de 32: ahí va el indicador de la opción elegida.
                    <DropdownMenuRadioItem key={o.value} value={o.value} style={{ ...menuItemStyle(o.value === value), paddingLeft: 32 }}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
