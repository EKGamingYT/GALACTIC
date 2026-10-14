// Kleine Hilfsfunktionen der Planetenkarte: Formatierung, Picking und Maßstab.
import { Cartesian3, Cartographic, Math as CesiumMath, SceneMode } from 'cesium';

export const nfmt = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtLat = (lat) => `${nfmt(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'}`;
export const fmtLon = (lon) => `${nfmt(Math.abs(lon))}° ${lon >= 0 ? 'O' : 'W'}`;
export function fmtKm(km) {
  if (km < 1) return `${Math.round(km * 1000).toLocaleString('de-DE')} m`;
  return `${km < 10 ? nfmt(km, 1) : Math.round(km).toLocaleString('de-DE')} km`;
}

// Punkt unter einer Bildschirmposition: Erde mit Gelände über die Kacheln, sonst die Kugel
export function pickSurface(scene, ellipsoid, pos, useTerrain) {
  if (useTerrain) {
    const hit = scene.globe.pick(scene.camera.getPickRay(pos), scene);
    if (hit) return hit;
  }
  return scene.camera.pickEllipsoid(pos, ellipsoid);
}

export function toLatLon(cart, ellipsoid) {
  const c = Cartographic.fromCartesian(cart, ellipsoid);
  return { lat: CesiumMath.toDegrees(c.latitude), lon: CesiumMath.toDegrees(c.longitude) };
}

// Meter pro Bildschirmpixel am Punkt `point` (Perspektive: nach Kameraabstand; 2D: Ausschnittsbreite)
export function metersPerPixel(scene, point) {
  const cam = scene.camera;
  const canvas = scene.canvas;
  if (scene.mode === SceneMode.SCENE2D) return (cam.frustum.right - cam.frustum.left) / canvas.clientWidth;
  const d = Cartesian3.distance(cam.positionWC, point);
  return (d * 2 * Math.tan(cam.frustum.fovy / 2)) / canvas.clientHeight;
}

// Größte „runde“ Länge (1, 2, 5 · 10ⁿ km) ≤ maxKm
export function niceKm(maxKm) {
  const p = 10 ** Math.floor(Math.log10(maxKm));
  const m = maxKm / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

// Abstand Kameramitte → Globusmitte, an den ganzen Globus angepasst (Anteil `fill` der kleineren Bildkante)
export function globeFitDistance(scene, radius, fill) {
  const f = scene.camera.frustum;
  const aspect = scene.canvas.clientWidth / Math.max(1, scene.canvas.clientHeight);
  fill ??= aspect < 1 ? 0.84 : 0.74; // Hochformat: Globus füllt die Breite stärker
  const tanY = Math.tan(f.fovy / 2);
  const half = Math.atan(Math.min(tanY, tanY * aspect)) * fill;
  const d = radius / Math.sin(half);
  // Unsichtbarer/0 px großer Container (Hintergrund-Tab, noch nicht gelayoutet): sinnvoller Ersatzwert
  return Number.isFinite(d) && d > radius ? d : radius * 3;
}
