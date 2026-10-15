// Service Worker: Zwischenspeicher für Kartenkacheln (NASA Trek, NASA GIBS, EOX, OSM, OpenTopoMap, AWS-Gelände).
// Strategie „Cache zuerst“: einmal geladene Kacheln kommen beim nächsten Mal sofort aus dem Speicher –
// auch nach Körperwechsel oder Neuladen. Kacheln ändern sich praktisch nie; der Speicher wird auf
// MAX_ENTRIES begrenzt (älteste zuerst raus). Nur erfolgreiche CORS-Antworten werden gespeichert.
const CACHE = 'galactic-tiles-v1';
const MAX_ENTRIES = 8000;
const HOSTS = [
  'trek.nasa.gov', 'gibs.earthdata.nasa.gov', 'tiles.maps.eox.at', 'tile.openstreetmap.org',
  'tile.opentopomap.org', 'a.tile.opentopomap.org', 'b.tile.opentopomap.org', 'c.tile.opentopomap.org', 's3.amazonaws.com',
];
const isTile = (url) => HOSTS.includes(url.hostname) && /\.(png|jpe?g|webp)$/i.test(url.pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let puts = 0;
async function trim() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isTile(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone()).then(() => { if (++puts % 200 === 0) trim(); }).catch(() => {});
    }
    return res;
  })());
});
