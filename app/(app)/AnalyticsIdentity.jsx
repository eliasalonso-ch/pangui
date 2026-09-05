"use client";

// Identifies the authenticated user to PostHog and Sentry, and resets on
// sign-out. Mounted inside the authenticated (app) layout so it runs on every
// authenticated page and re-identifies after reloads.
import { useEffect } from "react";
import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase";
import { getAuthUser, resetAuthUserCache } from "@/lib/auth-user";
import { resetPerfilUsuarioCache } from "@/lib/perfil-usuario";

function identify(user) {
  if (!user) return;
  Sentry.setUser({ id: user.id, email: user.email });
  if (posthog.__loaded) {
    posthog.identify(user.id, { email: user.email });
  }
}

function reset() {
  Sentry.setUser(null);
  if (posthog.__loaded) posthog.reset();
}

export default function AnalyticsIdentity() {
  useEffect(() => {
    const supabase = createClient();

    getAuthUser().then((user) => {
      if (user) identify(user);
    });

    // Ojo con TOKEN_REFRESHED: se dispara cada vez que se renueva el token, y
    // renovar NO cambia quien es el usuario. Invalidar la cache ahi montaba un
    // bucle -- reset -> el siguiente getAuthUser() va a la red -> getUser()
    // pide el access token -> refresh -> TOKEN_REFRESHED otra vez -- que en
    // produccion llego a 36 refrescos por minuto para un solo usuario y acabo
    // en 429 (rate limit) del endpoint /token.
    //
    // Solo se limpia cuando cambia la identidad de verdad.
    let lastUserId = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        lastUserId = null;
        resetAuthUserCache();
        resetPerfilUsuarioCache();
        reset();
        return;
      }

      const userId = session?.user?.id ?? null;
      if (userId !== lastUserId) {
        // Cambio de usuario (o primer login): ahora si las caches mienten.
        lastUserId = userId;
        resetAuthUserCache();
        resetPerfilUsuarioCache();
        if (session?.user) identify(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
