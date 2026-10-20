import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// CesiumJS braucht seine Worker/Assets als statische Dateien unter /cesium.
const cesiumSource = 'node_modules/cesium/Build/Cesium';

// Nur Dev-Server: /api/<name> lokal mit den Vercel-Funktionen aus api/<name>.js beantworten (ohne Passwortschutz,
// läuft nur auf dem eigenen Rechner). Kleiner Ersatz für req.query / res.status().json() / send().
function devApi() {
  return {
    name: 'galactic-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([a-z0-9-]+)(?:\?|$)/.exec(req.url || '');
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          const url = new URL(req.url, 'http://localhost');
          req.query = Object.fromEntries(url.searchParams);
          res.status = (c) => { res.statusCode = c; return res; };
          res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
          res.send = (s) => { res.end(typeof s === 'string' ? s : JSON.stringify(s)); return res; };
          await mod.default(req, res);
        } catch (e) {
          if (/Failed to load|does not exist/i.test(String(e?.message))) return next();
          res.statusCode = 500; res.end(String(e?.stack || e));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    devApi(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: 'cesium',
        rename: { stripBase: 4 }, // node_modules/cesium/Build/Cesium/ entfernen
      })),
    }),
  ],
  server: { port: 5173 },
  // Mehrseiten-Build: Atlas (index.html) + Admin-Panel für Stationsschlüssel (admin.html)
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
