const CACHE_NAME = "gt-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/ui/app.js?v=11",
  "/ui/plano.jpg",
  "/ui/modules/api.js",
  "/ui/modules/auth.js",
  "/ui/modules/config.js",
  "/ui/modules/details.v2.js",
  "/ui/modules/forms.js",
  "/ui/modules/list.v2.js",
  "/ui/modules/map.js",
  "/ui/modules/maps.js",
  "/ui/modules/modals.js",
  "/ui/modules/settings.js",
  "/ui/modules/socket.js",
  "/ui/modules/stats.js",
  "/ui/modules/store.js",
  "/ui/modules/utils.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  "https://cdn.socket.io/4.7.5/socket.io.min.js",
  "https://unpkg.com/marked@12.0.0/marked.min.js"
];

// Instalar SW y precachear assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignorar peticiones a la API y WebSockets (Network Only o Network First con lógica especial)
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/socket.io/")) {
    return;
  }

  // Estrategia Cache First para el resto
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html").then((fallback) => fallback || new Response("Sin conexión", { status: 503, statusText: "Service Unavailable" }));
        }
        return new Response("", { status: 503, statusText: "Service Unavailable" });
      });
    })
  );
});
