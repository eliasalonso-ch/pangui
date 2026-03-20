'use client';
import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        // Unregister all service workers in dev to prevent stale cache interference
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((r) => r.unregister());
        });
        return;
      }
      navigator.serviceWorker.register('/sw.js').catch((err) =>
        console.error('SW registration failed:', err)
      );
    }
  }, []);

  return null;
}
