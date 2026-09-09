"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Selección de un panel de detalle sincronizada con `?id=` en la URL.
 *
 * WHY THIS EXISTS: /ordenes y /activos ya se podían compartir por link — pegas
 * la URL en un chat y el otro abre la misma ficha. El resto de los catálogos
 * (planes, materiales, equipo, categorías, ITOs) guardaban la selección solo en
 * estado local, así que la URL se quedaba en `/categorias` sin importar qué
 * tuvieras abierto: no había forma de mandarle a alguien "mira ESTA categoría",
 * ni de recargar sin perder el sitio.
 *
 * Dos detalles que no son obvios y que ya costaron caros en /planes:
 *
 * 1. El id se lee en un efecto y NO en el `useState` inicial. El servidor no ve
 *    el query param, así que sembrarlo en el estado inicial hace que el HTML del
 *    servidor (sin panel) no coincida con el del cliente (con panel) y React
 *    descarte el árbol con un error de hidratación.
 *
 * 2. La URL se escribe con `replaceState` y no con `push`. El panel es un estado
 *    de la pantalla, no un destino propio: con `push`, "atrás" cerraría el panel
 *    en vez de salir de la sección, y volver atrás diez veces significaría
 *    cerrar diez paneles.
 */
export function useDeepLinkId(basePath: string) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
    // Solo al montar: de ahí en más la URL la gobiernan open() y close().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Abre un elemento y deja su id en la URL, listo para copiar y compartir. */
  function open(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, "", `${basePath}?id=${encodeURIComponent(id)}`);
  }

  /** Cierra el panel y limpia el query param. */
  function close() {
    setSelectedId(null);
    window.history.replaceState(null, "", basePath);
  }

  return { selectedId, open, close, setSelectedId };
}
