import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./supabase-cookies";

export function createClient() {
  // cookieOptions scopes the session to .getpangui.com so it is shared between
  // the marketing apex and app.getpangui.com. Without it the domain split logs
  // every existing user out. See lib/supabase-cookies.js.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions:
        typeof window === "undefined"
          ? undefined
          : sessionCookieOptions(window.location.hostname),
    }
  );
}

export function logRealtimeChannel(action, details = {}, client) {
  if (process.env.NODE_ENV === "production") return;

  const channelCount =
    client && typeof client.getChannels === "function"
      ? client.getChannels().length
      : undefined;

  console.info("[pangui:realtime]", {
    action,
    at: new Date().toISOString(),
    channelCount,
    ...details,
  });
}
