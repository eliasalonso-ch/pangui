const CACHE_NAME = 'pangui-v3';

// App-shell pages to precache on install
const PRECACHE_URLS = ['/', '/login', '/offline', '/jefe', '/tecnico'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // ── Supabase / API: network-only with JSON fallback ──────────
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // ── Static assets: cache-first ───────────────────────────────
  if (url.pathname.match(/\.(css|js|woff2?|png|svg|ico|webp|jpg|jpeg)$/)) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // ── Navigation (HTML pages): stale-while-revalidate ──────────
  // Returns cached shell immediately; updates cache in background.
  // Falls back to offline page if both fail.
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);

        // Serve cached immediately; update happens in background
        if (cached) {
          e.waitUntil(networkFetch);
          return cached;
        }
        // No cache yet — wait for network
        return (
          (await networkFetch) ||
          (await caches.match('/offline')) ||
          new Response(
            `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Sin conexión – Pangui</title>
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
            height:100vh;margin:0;background:#FAF8F5;color:#2C2418;text-align:center;padding:24px}
            p{font-size:15px;color:#7a6a5a;margin-top:8px}</style></head>
            <body><div><h2>Sin conexión</h2>
            <p>Tus datos se sincronizarán cuando vuelvas.</p></div></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          )
        );
      })
    );
    return;
  }

  // ── Everything else: network-first ───────────────────────────
  e.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ── Push notifications ────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();

  e.waitUntil(
    self.registration.showNotification(data.titulo || 'Pangui', {
      body: data.mensaje || '',
      icon: '/icons/web-app-manifest-192x192.png',
      badge: '/icons/web-app-manifest-192x192.png',
      data: { url: data.url || '/' },
      tag: data.tag || 'pangui',
      renotify: true,
      vibrate: data.urgente ? [200, 100, 200, 100, 200] : [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => w.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
      } else {
        clients.openWindow(targetUrl);
      }
    })
  );
});
