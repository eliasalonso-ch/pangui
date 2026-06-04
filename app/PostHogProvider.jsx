"use client";

// PostHog analytics provider. Initializes once on the client and wraps the app.
// Autocapture (clicks/inputs) + manual pageview tracking + session replay.
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
    autocapture: true,
    persistence: "localStorage+cookie",
    // Session replay — mask user input by default for privacy.
    session_recording: {
      maskAllInputs: true,
    },
    // Only enable replay in production to avoid recording local dev.
    disable_session_recording: process.env.NODE_ENV !== "production",
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
