const CACHE_NAME = 'pangui-v6';

// Solo assets seguros (NO páginas dinámicas como '/')
const STATIC_ASSETS = [];

// ── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // ── 1. APIs / Supabase → network only ───────────────────
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

  // ── 2. Navegación (HTML) → stale-while-revalidate ───────
  // Serve cached shell instantly; fetch fresh in background to update cache.
  // Safe for Next.js App Router: dynamic data always comes from client-side Supabase calls.
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);
        if (cached) return cached; // instant — update cache in background
        const networkResponse = await networkFetch;
        if (networkResponse) return networkResponse;
        return caches.match('/login'); // fully offline fallback
      })
    );
    return;
  }

  // ── 3. Assets estáticos → cache-first ───────────────────
  if (url.pathname.match(/\.(css|js|woff2?|png|svg|ico|webp|jpg|jpeg)$/)) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return res;
        });
      })
    );
    return;
  }

  // ── 4. Default → network-first ──────────────────────────
  e.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────
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
      vibrate: data.urgente
        ? [200, 100, 200, 100, 200]
        : [200, 100, 200],
    })
  );
});

// ── CLICK EN NOTIFICACIÓN ────────────────────────────────
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