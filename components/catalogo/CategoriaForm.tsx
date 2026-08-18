"use client";

import { useState } from "react";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";
import { PRESET_ICONOS, PRESET_COLORES } from "./catalogo-presets";
import { ICONO_POR_DEFECTO } from "@/lib/categorias-api";
import { PanelCatalogo, FieldRow, tituloInputStyle } from "./PanelCatalogo";

/**
 * Formulario de categoría (crear y editar).
 *
 * Usa el mismo armazón que "Nueva Orden de Trabajo": encabezado de 64px, título
 * grande subrayado, campos con etiqueta arriba y barra de acciones fija al pie.
 *
 * El modelo de datos es el del móvil: nombre + ícono + color. No hay campo
 * "Descripción" porque `categorias_ot` no tiene esa columna — en el móvil ese
 * campo existe pero nunca se envía, así que acá se omite en vez de copiar un
 * input que descarta lo que el usuario escribe.
 */
export default function CategoriaForm({ inicial, guardando, error, onCancel, onSubmit }: {
  inicial?: { nombre: string; icono: string | null; color: string | null };
  guardando: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (v: { nombre: string; icono: string; color: string }) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [icono, setIcono] = useState(inicial?.icono ?? ICONO_POR_DEFECTO);
  const [color, setColor] = useState(inicial?.color ?? PRESET_COLORES[0].hex);

  const valido = nombre.trim().length > 0;

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar Categoría" : "Nueva Categoría"}
      guardando={guardando}
      puedeGuardar={valido}
      error={error}
      textoGuardar={inicial ? "Guardar" : "Crear"}
      onCancel={onCancel}
      onSubmit={() => onSubmit({ nombre: nombre.trim(), icono, color })}
    >
      {/* Título: input grande subrayado, igual que "¿Qué trabajo se debe realizar?" */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Ingrese el nombre de la categoría"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          autoFocus
          style={tituloInputStyle(nombre)}
        />
      </div>

      {/* Los íconos se muestran igual que en la lista y en la ficha: glifo del
          color de la categoría sobre un disco del mismo color atenuado. Así lo
          que se elige acá es literalmente lo que se verá después. */}
      <FieldRow label="Ícono">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {PRESET_ICONOS.map(i => {
            const sel = icono === i.ionicon;
            return (
              <button
                key={i.ionicon}
                type="button"
                onClick={() => setIcono(i.ionicon)}
                title={i.label}
                aria-label={i.label}
                aria-pressed={sel}
                style={{
                  width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "50%", cursor: "pointer", padding: 0,
                  background: color + "22",
                  border: sel ? `2px solid ${color}` : "2px solid transparent",
                  transition: "border-color var(--dur-fast) var(--ease)",
                }}
              >
                <CategoriaIcon icono={i.ionicon} size={18} color={color} />
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow label="Color">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {PRESET_COLORES.map(c => {
            const sel = color === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={sel}
                style={{
                  width: 32, height: 32, borderRadius: "50%", cursor: "pointer", padding: 0,
                  background: c.hex,
                  border: sel ? "2px solid var(--fg-1)" : "1px solid var(--border)",
                  boxShadow: sel ? "0 0 0 2px var(--surface-1) inset" : "none",
                }}
              />
            );
          })}
        </div>
      </FieldRow>

    </PanelCatalogo>
  );
}
