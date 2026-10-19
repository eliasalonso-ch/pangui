"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toaster de la app (Sonner, el mismo que usa shadcn). No copia las clases
 * Tailwind del componente de shadcn, que aquí no renderizan bien: toma los
 * tokens de la app como variables de Sonner, así sigue el modo oscuro de
 * `data-theme` sin lógica extra. Los botones y la descripción se ajustan en
 * globals.css (bloque "Sonner").
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      style={{
        "--normal-bg": "var(--surface-1)",
        "--normal-text": "var(--fg-1)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--r-md)",
        fontFamily: "inherit",
      } as React.CSSProperties}
      toastOptions={{ style: { fontSize: 14 } }}
      {...props}
    />
  );
}

/**
 * Ícono en círculo para los toasts verticales (`className: "toast-vertical"`):
 * ícono arriba, texto al medio, botones abajo. El layout vive en globals.css.
 */
export function IconoToast({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center",
      background: "var(--brand-tint)", color: "var(--brand)",
    }}>
      {children}
    </span>
  );
}
