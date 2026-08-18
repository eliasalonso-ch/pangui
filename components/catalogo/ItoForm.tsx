"use client";

import { useState } from "react";
import { PanelCatalogo, tituloInputStyle } from "./PanelCatalogo";

/**
 * Formulario de ITO (crear y editar). Mismo armazón que "Nueva Orden de Trabajo".
 *
 * Un ITO es solo un nombre: la tabla `hitos` no guarda ícono ni color, así que
 * el panel tiene un único campo en vez de inventar atributos que no se
 * persisten.
 */
export default function ItoForm({ inicial, ordenesVinculadas, guardando, error, onCancel, onSubmit }: {
  inicial?: { nombre: string };
  /** Cuántas OTs se arrastrarán al renombrar. Solo informativo. */
  ordenesVinculadas?: number;
  guardando: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const valido = nombre.trim().length > 0;
  const cambioNombre = inicial ? nombre.trim() !== inicial.nombre.trim() : false;

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar ITO" : "Nuevo ITO"}
      guardando={guardando}
      puedeGuardar={valido}
      error={error}
      textoGuardar={inicial ? "Guardar" : "Crear"}
      onCancel={onCancel}
      onSubmit={() => onSubmit(nombre.trim())}
    >
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Ingrese el nombre del ITO"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          autoFocus
          style={tituloInputStyle(nombre)}
        />
      </div>

      {/* Las OTs guardan el ITO como texto, así que renombrar las reescribe.
          Se avisa antes de guardar para que no sea una sorpresa. */}
      {inicial && cambioNombre && (ordenesVinculadas ?? 0) > 0 && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "var(--st-wait-bg)", border: "1px solid var(--border)",
          fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.6,
        }}>
          Se actualizará el ITO en {ordenesVinculadas}{" "}
          {ordenesVinculadas === 1 ? "orden de trabajo" : "órdenes de trabajo"} para conservar su historial.
        </div>
      )}

      {!inicial && (
        <div style={{ fontSize: 12.5, color: "var(--fg-3)", lineHeight: 1.6 }}>
          El ITO quedará disponible para asociarlo al crear o editar una orden de trabajo.
        </div>
      )}
    </PanelCatalogo>
  );
}
