const CACHE_NAME = 'pangi-v1';
const STATIC_ASSETS = ['/', '/login', '/offline'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
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
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  if (url.pathname.match(/\.(css|js|woff2?|png|svg|ico|webp|jpg|jpeg)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ||
        fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match('/offline') ||
      new Response(
        `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Sin conexión – Pangi</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;background:#FAF8F5;color:#2C2418;text-align:center;padding:24px}
        p{font-size:15px;color:#7a6a5a;margin-top:8px}</style></head>
        <body><div><h2>Sin conexión</h2>
        <p>Tus datos se sincronizarán cuando vuelvas.</p></div></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      )
    )
  );
});

// ── Push notifications ────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();

  e.waitUntil(
    self.registration.showNotification(data.titulo || 'Pangi', {
      body: data.mensaje || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.tag || 'pangi',
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
