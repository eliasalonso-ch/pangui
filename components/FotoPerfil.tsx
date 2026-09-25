"use client";

import type { ReactNode } from "react";
import { useAvatares } from "@/lib/queries";

/**
 * Contenido de un avatar de usuario: su foto de perfil si tiene, si no lo que
 * venga como children (las iniciales). Va DENTRO del círculo que ya pinta cada
 * pantalla, así cada avatar conserva su tamaño, borde y degradado de siempre.
 */
export function FotoOIniciales({ id, children }: { id: string | null | undefined; children: ReactNode }) {
  const { data } = useAvatares();
  const url = id ? data?.get(id) : undefined;
  if (!url) return <>{children}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 256px JPEG propio, next/image no aporta
    <img src={url} alt="" draggable={false} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", display: "block" }} />
  );
}
