"use client";

import { Plus } from "lucide-react";

/**
 * Vacios compartidos de las pantallas lista-detalle.
 *
 * Antes cada pantalla escribia el suyo: once copias con cuatro tratamientos
 * distintos del boton (boton real solo en /planes, un <a href="#"> subrayado en
 * /ordenes y /activos, texto muerto en los catalogos, y nada en /materiales) y
 * tres tamanos de icono. El diseno que gana es el de /planes: circulo azul
 * grande y un boton de verdad, porque un vacio es justamente donde hay que
 * ofrecer la accion, no describirla.
 */

/**
 * Vacio de la columna izquierda: circulo azul, titulo, explicacion y CTA.
 *
 * `hasSearch` distingue "no hay nada todavia" de "tu busqueda no encontro
 * nada": en el segundo caso ofrecer "crear el primero" es una respuesta
 * equivocada a lo que el usuario acaba de hacer, asi que solo va el titulo.
 */
export function EmptyState({
  icon, title, description, onCreate, createLabel, hasSearch = false,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onCreate?: () => void;
  createLabel?: string;
  hasSearch?: boolean;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "70px 20px", textAlign: "center",
    }}>
      <span style={{
        width: 92, height: 92, borderRadius: "50%",
        background: "var(--brand-tint)", color: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
      }}>
        {icon}
      </span>
      <p style={{ fontSize: 14, color: "var(--fg-1)", fontWeight: 500, margin: 0 }}>
        {title}
      </p>
      {!hasSearch && description && (
        <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "8px 0 20px", maxWidth: 430 }}>
          {description}
        </p>
      )}
      {!hasSearch && onCreate && (
        <button
          onClick={onCreate}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 17px", borderRadius: 8, border: "none",
            background: "var(--brand)", color: "var(--fg-on-brand)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
        >
          <Plus size={15} />
          {createLabel ?? "Crear el primero"}
        </button>
      )}
    </div>
  );
}

/** Panel de detalle sin nada abierto: solo el fondo, sin ícono ni texto. */
export function EmptyDetail() {
  return <div style={{ flex: 1, minWidth: 0, height: "100%", background: "var(--surface-canvas)" }} />;
}
