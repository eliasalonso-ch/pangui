"use client";

// Identifies the authenticated user to PostHog and Sentry, and resets on
// sign-out. Mounted inside the authenticated (app) layout so it runs on every
// authenticated page and re-identifies after reloads.
import { useEffect } from "react";
import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase";

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

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) identify(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
