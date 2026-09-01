"use client";

// PostHog analytics provider. Initializes once on the client and wraps the app.
// Solo eventos explicitos + pageview manual: autocapture y session replay
// estan apagados a proposito (ver los comentarios en init).
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://n.getpangui.com";

if (typeof window !== "undefined" && POSTHOG_KEY && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We track pageviews manually (below) so SPA navigations are captured.
    capture_pageview: false,
    capture_pageleave: true,
    // Autocapture APAGADO. Instalaba listeners globales de click/input/scroll y,
    // por cada evento, recorria el DOM hacia arriba para construir el selector
    // CSS del elemento; sobre el DOM de /inicio ese recorrido es el tironeo que
    // quedaba despues de apagar session replay (el stack de las peticiones a
    // /e/ y /i/v0/e/ lo senalaba: capture -> enqueue -> _send_request).
    //
    // No se pierde nada que se use: los eventos de producto (ot_created,
    // ot_completed, subscription_activated, trial_started, pdf_exported,
    // signed_in) son todos explicitos —ver lib/analytics.ts— y el $pageview se
    // manda a mano mas abajo. Autocapture solo agregaba clicks anonimos.
    autocapture: false,
    persistence: "localStorage+cookie",
    // Session replay APAGADO, tambien en produccion.
    //
    // rrweb observa mutaciones del DOM y scroll de forma continua y descarga a
    // /s/ cada ~10 s. En /inicio —400 OTs, DOM grande— ese trabajo de captura
    // cae en el main thread justo mientras se hace scroll: el tironeo aparecia
    // exactamente en el instante de cada peticion a /s/, ni antes ni despues.
    //
    // Si se vuelve a activar, medir el scroll de /inicio antes y despues.
    disable_session_recording: true,
    // Surveys are on by default and pull a separate 33KB surveys.js on every
    // page load. We don't use PostHog surveys, so don't ship the bundle.
    disable_surveys: true,
  });
}

// Tracks SPA route changes as $pageview events.
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!pathname || !ph) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += "?" + qs;
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }) {
  // If no key is configured, render children without the provider (no-op).
  if (!POSTHOG_KEY) return children;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}
