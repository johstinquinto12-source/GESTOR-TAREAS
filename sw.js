/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Gestor de Tareas v3
   - Cache First para assets estáticos
   - Respaldo de datos del usuario en Cache API
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME   = 'gestor-tareas-v3';
const DATA_CACHE   = 'gestor-datos-v3';

const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './Logo-192.png',
  './Logo-512.png',
];

/* ── INSTALL ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ARCHIVOS_CACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Network first para index.html, cache first para el resto ── */
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // index.html: siempre intentar red primero para tener la última versión
  if(url.pathname.endsWith('index.html') || url.pathname.endsWith('/')){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resto: cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res && res.status === 200 && res.type !== 'opaque'){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => null);
    })
  );
});

/* ── MENSAJE: guardar datos desde la app ── */
self.addEventListener('message', e => {
  if(!e.data || e.data.type !== 'GUARDAR_DATOS') return;

  // Guardar los datos del usuario en DATA_CACHE como respaldo
  const datos = e.data.payload; // objeto con h, hOtros, fcDatos, horarioListo
  caches.open(DATA_CACHE).then(cache => {
    const respuesta = new Response(JSON.stringify(datos), {
      headers: {'Content-Type': 'application/json'}
    });
    cache.put('datos-usuario', respuesta);
  });
});

/* ── MENSAJE: recuperar datos ── */
self.addEventListener('message', e => {
  if(!e.data || e.data.type !== 'RECUPERAR_DATOS') return;
  caches.open(DATA_CACHE).then(cache => {
    cache.match('datos-usuario').then(res => {
      if(res) res.json().then(datos => {
        e.source.postMessage({type:'DATOS_RECUPERADOS', payload: datos});
      });
      else e.source.postMessage({type:'DATOS_RECUPERADOS', payload: null});
    });
  });
});

/* ── NOTIFICACIONES ── */
self.addEventListener('push', e => {
  let data = {title:'📋 Gestor de Tareas', body:'Tienes tareas pendientes.'};
  try{ data = e.data.json(); }catch(err){}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon:'./Logo-192.png', badge:'./Logo-192.png',
      vibrate:[200,100,200], tag:'gestor-notif', renotify:true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      for(const c of list){
        if(c.url.includes('index.html') && 'focus' in c) return c.focus();
      }
      if(clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});