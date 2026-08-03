// Pangui service worker — Web Push ONLY.
//
// This is NOT a PWA. There is deliberately no manifest.json, no install
// prompt, no offline support and no `fetch` handler. A service worker is
// simply the only mechanism browsers expose for receiving push, so this file
// exists to be woken for a `push` event and nothing else.
//
// History, so nobody re-adds the parts that were removed on purpose:
//   - The original worker cached HTML navigations (stale-while-revalidate),
//     which served users outdated pages after a deploy. It was deleted whole
//     in commit cca0231, taking push down with it.
//   - The PWA/manifest was then dropped for good in favour of the native
//     Play Store / App Store apps.
// Do NOT add a `fetch` handler here. Caching app HTML is what broke it before.
//
// Reach: desktop Chrome/Edge/Firefox deliver push to ordinary tabs with no
// install. iOS Safari only delivers to home-screen-installed sites, so iPhone
// users get notifications through the native app instead.

self.addEventListener('install', () => {
  // Activate immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Purge caches left behind by the old caching worker. Returning users can
    // still be holding `pangui-v6` entries that would otherwise keep serving
    // them stale HTML until the browser evicted those entries on its own.
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// ── Push ──────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    // A malformed payload must not kill the handler — show something useful.
    data = { titulo: 'Pangui', mensaje: e.data.text() };
  }

  e.waitUntil(
    self.registration.showNotification(data.titulo || 'Pangui', {
      body: data.mensaje || '',
      icon: '/icons/web-app-manifest-192x192.png',
      badge: '/icons/web-app-manifest-192x192.png',
      data: { url: data.url || '/' },
      // Same tag => a repeated alert for one OT replaces the previous banner
      // instead of stacking. renotify still re-alerts the user.
      tag: data.tag || 'pangui',
      renotify: true,
      requireInteraction: Boolean(data.urgente),
      vibrate: data.urgente ? [200, 100, 200, 100, 200] : [200, 100, 200],
    })
  );
});

// ── Click ─────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => w.url.startsWith(self.location.origin));

    if (existing) {
      // focus() first: navigate() can reject if the client isn't focused.
      await existing.focus();
      if ('navigate' in existing) {
        await existing.navigate(targetUrl).catch(() => {});
      }
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});
