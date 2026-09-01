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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // La identidad cacheada por getAuthUser() deja de ser valida en cuanto
      // cambia la sesion, sea cual sea el evento. El perfil va con ella: es la
      // fila de `usuarios` de ese mismo usuario.
      resetAuthUserCache();
      resetPerfilUsuarioCache();

      if (event === "SIGNED_OUT") {
        reset();
        return;
      }
      if (session?.user) identify(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
