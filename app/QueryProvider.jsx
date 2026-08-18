"use client";

// TanStack Query provider for the web app.
//
// WHY THIS EXISTS: reference data (categorías, usuarios, ubicaciones, lugares)
// was refetched on every component mount — and OTDetail refetched several of
// them every time you opened an OT. That data changes maybe weekly. Network
// captures showed the same `categorias_ot` and `workspaces` requests firing
// repeatedly during a single page load.
//
// Mirrors mobile (pangui-native-stable/lib/query-client.ts) so both platforms
// share one mental model, but DELIBERATELY does not copy two of its settings:
//
//   * onlineManager + NetInfo — a React Native workaround. The browser's
//     built-in online/offline events already work, and overriding them here
//     would break `refetchOnReconnect`.
//   * networkMode: "always"   — mobile needs it because its offline write path
//     must run while disconnected (SQLite + outbox). The web has no offline
//     write path, so the default ("online", i.e. pause while offline) is the
//     correct behaviour here.
//
// The client is created inside useState so each browser session gets exactly
// one instance, and so it is never shared across requests during SSR — a
// module-level client would leak one user's cached data into another user's
// render.

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reference data is the main tenant here and it is near-static, so
            // a long stale window is the whole point. Individual queries that
            // need fresher data override this.
            staleTime: 5 * 60 * 1000, // 5 min
            gcTime: 30 * 60 * 1000, // 30 min
            // The bandeja already refetches on its own schedule (realtime +
            // a 120s snapshot cooldown). Refetching on every window focus on
            // top of that is the behaviour that pushed egress to 3.35 GB/month
            // before the cooldown existed — do not turn this back on globally.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
