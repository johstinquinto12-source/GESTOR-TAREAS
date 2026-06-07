/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Gestor de Tareas v4
   FIX: Cache-First robusto, notificaciones SW correctas,
        respaldo de datos en Cache API para soporte offline.
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'gestor-tareas-v4';   // ← subir versión para forzar actualización
const DATA_CACHE = 'gestor-datos-v4';

/* ── Archivos estáticos esenciales a cachear en install ── */
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './Logo-192.png',
  './Logo-512.png',
  /* Fuentes de Google (se cachean en runtime; se listan aquí como referencia) */
];

/* ════════════════════════════════════════════════════════════
   INSTALL — pre-cachear assets críticos
════════════════════════════════════════════════════════════ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS_CACHE))
      .then(() => self.skipWaiting())   // activar inmediatamente sin esperar a que se cierre la pestaña
  );
});

/* ════════════════════════════════════════════════════════════
   ACTIVATE — limpiar cachés antiguas
════════════════════════════════════════════════════════════ */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // tomar control de todas las pestañas abiertas
  );
});

/* ════════════════════════════════════════════════════════════
   FETCH — estrategia híbrida:
     • index.html        → Network-first (siempre intentar red para tener la
                           versión más reciente; caer en caché si offline)
     • Fuentes Google    → Cache-first con fetch de respaldo (opaque ok)
     • Resto de assets   → Cache-first con actualización en segundo plano (SWR)
════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  /* ── index.html: Network-first ── */
  if (url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Guardar copia fresca en caché
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))  // offline: servir desde caché
    );
    return;
  }

  /* ── Fuentes externas (Google Fonts, etc.): Cache-first, opaque permitido ── */
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          // Cachear incluso respuestas opaque (cross-origin sin CORS)
          if (res && (res.status === 200 || res.type === 'opaque')) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => null);
      })
    );
    return;
  }

  /* ── Assets locales: Cache-first con actualización en segundo plano (SWR) ── */
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res && res.status === 200) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        // Servir inmediatamente desde caché si existe (sin esperar red)
        return cached || fetchPromise;
      })
    )
  );
});

/* ════════════════════════════════════════════════════════════
   MENSAJES — guardar / recuperar datos del usuario
════════════════════════════════════════════════════════════ */
self.addEventListener('message', e => {
  if (!e.data) return;

  /* ── Guardar datos ── */
  if (e.data.type === 'GUARDAR_DATOS') {
    const datos = e.data.payload;
    caches.open(DATA_CACHE).then(cache => {
      const respuesta = new Response(JSON.stringify(datos), {
        headers: { 'Content-Type': 'application/json' }
      });
      cache.put('datos-usuario', respuesta);
    });
    return;
  }

  /* ── Recuperar datos ── */
  if (e.data.type === 'RECUPERAR_DATOS') {
    caches.open(DATA_CACHE).then(cache => {
      cache.match('datos-usuario').then(res => {
        if (res) {
          res.json().then(datos => {
            e.source.postMessage({ type: 'DATOS_RECUPERADOS', payload: datos });
          });
        } else {
          e.source.postMessage({ type: 'DATOS_RECUPERADOS', payload: null });
        }
      });
    });
    return;
  }
});

/* ════════════════════════════════════════════════════════════
   PUSH — notificaciones push desde servidor (opcional)
════════════════════════════════════════════════════════════ */
self.addEventListener('push', e => {
  let data = { title: '📋 Gestor de Tareas', body: 'Tienes tareas pendientes.' };
  try { data = e.data.json(); } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:      data.body,
      icon:      './Logo-192.png',
      badge:     './Logo-192.png',
      vibrate:   [200, 100, 200],
      tag:       'gestor-notif',
      renotify:  true
    })
  );
});

/* ════════════════════════════════════════════════════════════
   NOTIFICATIONCLICK — abrir/enfocar la app al tocar la notif
════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('index.html') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});