import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
