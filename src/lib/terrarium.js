// Offenes 3D-Gelände der Erde aus den AWS Terrain Tiles (Format „Terrarium“,
// Mapzen; Quellen u. a. SRTM, GMTED, ETOPO1). Höhe in Metern =
// (R · 256 + G + B / 256) − 32768. Cesium kennt das Format nicht, daher
// dekodieren wir die PNG-Kacheln selbst zu Höhenrastern.
import {
  Credit, Event, HeightmapTerrainData, Resource, TerrainProvider, WebMercatorTilingScheme,
} from 'cesium';

const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const SIZE = 65;       // Stützpunkte pro Kachelkante
const MAX_LEVEL = 15;  // feinste verfügbare Ebene
const MIN_LEVEL = 6;   // darunter (Kacheln > ~600 km) sind Höhen aus der Ferne unsichtbar → flach, ohne Netzanfrage

export function createTerrariumTerrain(ellipsoid, exaggerate = 1) {
  const tilingScheme = new WebMercatorTilingScheme({ ellipsoid, numberOfLevelZeroTilesX: 1, numberOfLevelZeroTilesY: 1 });
  const levelZeroError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(ellipsoid, SIZE, 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const flat = new Float32Array(SIZE * SIZE);

  return {
    tilingScheme,
    errorEvent: new Event(),
    credit: new Credit('Gelände: AWS Terrain Tiles (Mapzen; SRTM, GMTED, ETOPO1 u. a.)'),
    hasWaterMask: false,
    hasVertexNormals: false,
    availability: undefined,
    getLevelMaximumGeometricError: (level) => levelZeroError / (1 << level),
    getTileDataAvailable: (x, y, level) => level <= MAX_LEVEL,
    loadTileDataAvailability: () => undefined,

    requestTileGeometry(x, y, level) {
      // Grobe Ebenen sofort flach liefern: jede Bildkachel wartet in Cesium auf ihre Geländekachel –
      // so erscheinen Karten beim Öffnen und Heranzoomen ohne diesen Umweg
      if (level < MIN_LEVEL) return Promise.resolve(new HeightmapTerrainData({ buffer: flat, width: SIZE, height: SIZE, childTileMask: 15 }));
      const url = URL.replace('{z}', level).replace('{x}', x).replace('{y}', y);
      const image = Resource.fetchImage({ url, preferImageBitmap: true });
      if (!image) return undefined; // Cesium drosselt Anfragen – später erneut
      return image.then((img) => {
        ctx.drawImage(img, 0, 0, 256, 256);
        const px = ctx.getImageData(0, 0, 256, 256).data;
        const heights = new Float32Array(SIZE * SIZE);
        for (let row = 0; row < SIZE; row++) {
          for (let col = 0; col < SIZE; col++) {
            const sx = Math.round((col / (SIZE - 1)) * 255);
            const sy = Math.round((row / (SIZE - 1)) * 255);
            const i = (sy * 256 + sx) * 4;
            const h = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
            heights[row * SIZE + col] = Math.max(h, 0) * exaggerate; // Meeresboden flach lassen
          }
        }
        return new HeightmapTerrainData({
          buffer: heights, width: SIZE, height: SIZE,
          childTileMask: level < MAX_LEVEL ? 15 : 0,
        });
      });
    },
  };
}
