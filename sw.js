/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Gestor de Tareas
   Estrategia: Cache First con fallback a red
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'gestor-tareas-v2';

// Archivos que se cachean al instalar
const ARCHIVOS_CACHE = [
  './index.html',
  './manifest.json',
  './Logo-192.png',
  './Logo-512.png',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap'
];

/* ── INSTALL: cachear archivos base ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ARCHIVOS_CACHE);
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches viejos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache First, fallback a red ── */
self.addEventListener('fetch', event => {
  // Solo manejar GET
  if (event.request.method !== 'GET') return;

  // Ignorar peticiones del navegador que no son de la app
  const url = new URL(event.request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // No está en cache → ir a la red y cachear
      return fetch(event.request).then(response => {
        // Solo cachear respuestas válidas
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Sin red y sin cache → si es HTML, devolver index.html
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ── PUSH: notificaciones push (base para futuro uso) ── */
self.addEventListener('push', event => {
  let data = { title: '📋 Gestor de Tareas', body: 'Tienes una notificación pendiente.' };
  try { data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './Logo-192.png',
      badge: './Logo-192.png',
      vibrate: [200, 100, 200],
      tag: 'gestor-notif',
      renotify: true
    })
  );
});

/* ── NOTIFICATION CLICK: abrir la app al tocar la notif ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana, abrir una nueva
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
