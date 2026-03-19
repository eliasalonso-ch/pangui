"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Eagerly prefetches the given routes on mount so their JS bundles
 * are ready before the user taps — zero download delay on first visit.
 */
export default function PrefetchRoutes({ routes }) {
  const router = useRouter();
  useEffect(() => {
    const prefetch = () => routes.forEach((r) => router.prefetch(r));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(prefetch, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 2000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
