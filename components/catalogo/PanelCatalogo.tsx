"use client";

import { Loader2 } from "lucide-react";

/**
 * Armazón de los paneles de creación/edición de catálogos (Categorías, ITOs).
 *
 * Replica el panel "Nueva Orden de Trabajo" (`app/(app)/ordenes/OTCrearPanel.tsx`):
 * encabezado de 64px sobre el lienzo, cuerpo desplazable con aire abajo, y una
 * barra de acciones fija al pie con "Cancelar" y el botón principal en degradado.
 * Se comparte para que los dos catálogos no se desincronicen del original.
 */

/**
 * Etiqueta arriba y control abajo — el `FieldRow` del panel de Órdenes.
 *
 * `icon` va en una canaleta fija de 16px a la izquierda y siempre en azul de
 * marca, igual que en OTCrearPanel: es lo que identifica el campo de un
 * vistazo. Las filas se separan con espacio (`padding: "14px 0"`) y nunca con
 * divisores — los divisores quedan para cerrar secciones enteras.
 */
export function FieldRow({ icon, label, children }: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "14px 0" }}>
      <div style={{ width: 16, paddingTop: 3, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", marginBottom: 10, letterSpacing: "0.01em" }}>
          {label}
        </label>
        {children}
      </div>
    </div>
  );
}

/**
 * Caja de texto de los paneles de catálogo.
 *
 * Estaba copiada palabra por palabra en ProveedorForm, OCForm y LineasPicker.
 * Incluye el foco: los tres ponían `outline: "none"` sin reemplazo, así que los
 * campos no mostraban ningún indicador al recibir el teclado. Se aplica con
 * `onFocus`/`onBlur` — ver `focoInput`.
 */
export const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px",
  border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  fontSize: 14, background: "var(--surface-1)", color: "var(--fg-1)",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: "auto", padding: 10, resize: "vertical", lineHeight: 1.7,
};

/**
 * Handlers de foco para los inputs de arriba.
 *
 * Se hace con eventos y no con `:focus-visible` porque estos estilos son
 * objetos inline, sin hoja de estilos donde declarar la pseudo-clase. Mismo
 * recurso que ya usaba el buscador de la barra superior.
 */
export const focoInput = {
  onFocus: (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "var(--brand)";
    e.currentTarget.style.boxShadow = "var(--shadow-focus)";
  },
  onBlur: (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow = "none";
  },
};

/**
 * Botón secundario de la cabecera de un detalle (Editar, Descargar…).
 *
 * Estaba duplicado en OCDetalle y en el detalle de proveedores, con los mismos
 * valores escritos dos veces.
 */
export const btnSecundario: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
  background: "var(--surface-1)", border: "1px solid var(--border)",
  borderRadius: "var(--r-md)", cursor: "pointer", fontSize: 14,
  color: "var(--fg-1)", fontFamily: "inherit",
};

export const btnPrimarioDetalle: React.CSSProperties = {
  ...btnSecundario, background: "var(--brand)", border: "none", color: "var(--fg-on-brand)",
};

/** Igual que el secundario pero cuadrado, para acciones de solo ícono. */
export const btnIcono: React.CSSProperties = {
  ...btnSecundario, width: 34, padding: 0, justifyContent: "center", color: "var(--fg-2)",
};

/**
 * Sección de un detalle, cerrada con una regla gris.
 *
 * Los márgenes negativos llevan la línea al ancho completo del panel mientras
 * el padding devuelve el texto a su inset de 28px. Es un `borderBottom` sobre
 * el bloque y no un `<hr>` aparte porque un hermano suelto recibiría el gap del
 * flex por los dos lados y la regla se despegaría de su sección.
 */
export const seccionDetalle: React.CSSProperties = {
  marginLeft: -28, marginRight: -28,
  paddingLeft: 28, paddingRight: 28,
  paddingTop: 16, paddingBottom: 16,
  borderBottom: "1px solid var(--border)",
};

/**
 * Input de título: grande, sin caja, subrayado que se tiñe de marca al escribir.
 * Mismo tratamiento que "¿Qué trabajo se debe realizar?".
 */
export function tituloInputStyle(valor: string): React.CSSProperties {
  return {
    width: "100%", fontSize: 14, fontWeight: 400,
    color: "var(--fg-1)", border: "none", outline: "none",
    background: "transparent", padding: "8px 0",
    borderBottom: "2px solid " + (valor ? "var(--brand)" : "var(--border)"),
    fontFamily: "inherit", transition: "border-color 0.15s",
  };
}

export function PanelCatalogo({
  titulo, guardando, puedeGuardar, error, textoGuardar, onCancel, onSubmit, children,
}: {
  titulo: string;
  guardando: boolean;
  puedeGuardar: boolean;
  error?: string | null;
  textoGuardar: string;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Encabezado */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        {/* 20px como el <h2> de los paneles de OT: con 14px el encabezado
            pesaba lo mismo que un rótulo de campo y el panel no tenía título. */}
        <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          {titulo}
        </h2>
      </div>

      {/* Cuerpo desplazable */}
      <form
        onSubmit={e => { e.preventDefault(); if (puedeGuardar && !guardando) onSubmit(); }}
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        <div style={{ padding: "28px 28px 60px", maxWidth: 1180 }}>
          {children}
        </div>
      </form>

      {/* Barra de acciones fija */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface-1)", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 14, color: "var(--danger)" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={guardando}
            style={{
              height: 40, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--fg-2)",
              fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!puedeGuardar || guardando}
            style={{
              height: 40, padding: "0 24px",
              border: "none", borderRadius: 8,
              background: guardando || !puedeGuardar
                ? "var(--fg-3)"
                : "linear-gradient(135deg, var(--brand-active), var(--brand))",
              color: "var(--fg-on-brand)",
              fontSize: 14, fontWeight: 400,
              cursor: guardando || !puedeGuardar ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 7,
              transition: "opacity 0.15s", fontFamily: "inherit",
              // --shadow-sm y no un rgba suelto: el valor anterior era el azul
              // 600 de Tailwind, que no coincide con --brand (#007AFF) y no se
              // adaptaba al tema oscuro.
              boxShadow: guardando || !puedeGuardar ? "none" : "var(--shadow-sm)",
            }}
          >
            {guardando && <Loader2 size={13} className="animate-spin" />}
            {textoGuardar}
          </button>
        </div>
      </div>
    </div>
  );
}
