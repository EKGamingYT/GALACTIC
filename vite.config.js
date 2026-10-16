import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// CesiumJS braucht seine Worker/Assets als statische Dateien unter /cesium.
const cesiumSource = 'node_modules/cesium/Build/Cesium';

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
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
