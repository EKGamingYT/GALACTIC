// Ortsnamen auf der Planetenkarte: offizielle IAU-Namen (USGS Gazetteer of Planetary Nomenclature, gemeinfrei),
// lazy je Körper geladen. Welche Namen sichtbar sind, entscheidet die Bildschirmgröße des Objekts
// (Durchmesser / Meter pro Pixel am Objekt) plus eine einfache Kollisionsprüfung – große Namen aus der Ferne,
// kleine erst beim Heranzoomen. Rückseite des Globus wird ausgeblendet.
import {
  Cartesian2, Cartesian3, Color, HorizontalOrigin, LabelCollection, LabelStyle, SceneMode, VerticalOrigin,
} from 'cesium';
import { CLASSES, typeInfo } from './featureTypes.js';

const loaders = import.meta.glob('../../data/nomenclature/*.json');
const keyOf = (id) => `../../data/nomenclature/${id}.json`;
export const hasNames = (id) => keyOf(id) in loaders;

// Mindestgröße (Pixel) bis ein Name erscheint
const MIN_PX = { crater: 34, mountain: 26, valley: 26, volcano: 26, plain: 40, region: 40, other: 26 };
const fontSize = (px) => (px > 320 ? 19 : px > 130 ? 16 : px > 65 ? 14 : 12);
const OUTLINE = new Color(0.02, 0.03, 0.07, 0.95);
const ACCENT = Color.fromCssColorString('#6ea8ff');

export function createNames(viewer, { ellipsoid, radius, bodyId, reserved }) {
  const { scene } = viewer;
  const camera = scene.camera;
  const canvas = scene.canvas;
  const labels = scene.primitives.add(new LabelCollection({ scene }));
  const colors = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, Color.fromCssColorString(v.color)]));
  let feats = [];
  let enabled = false;
  let selected = -1;
  let shown = [];
  let lastTime = 0;
  const last = { pos: new Cartesian3(), dir: new Cartesian3(), w: 0, h: 0 };
  const tmp = new Cartesian2();

  function refresh() {
    if (!enabled || !feats.length) return;
    const mode = scene.mode;
    if (mode !== SceneMode.SCENE3D && mode !== SceneMode.SCENE2D) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const is3d = mode === SceneMode.SCENE3D;
    const cam = camera.positionWC;
    const camLen = Cartesian3.magnitude(cam);
    const q = radius / camLen;
    const cosMin = q + 0.05 * (1 - q); // Horizont mit kleinem Randabstand
    const k = (2 * Math.tan(camera.frustum.fovy / 2)) / h;
    const mpp2d = (camera.frustum.right - camera.frustum.left) / w;

    const cands = [];
    for (const f of feats) {
      if (is3d && (f.n.x * cam.x + f.n.y * cam.y + f.n.z * cam.z) / camLen < cosMin) continue;
      const mpp = is3d ? Cartesian3.distance(cam, f.pos) * k : mpp2d;
      const px = (f.km * 1000) / mpp;
      if (px < MIN_PX[f.cls]) continue;
      if (!scene.cartesianToCanvasCoordinates(f.pos, tmp)) continue;
      if (tmp.x < -30 || tmp.x > w + 30 || tmp.y < -20 || tmp.y > h + 20) continue;
      cands.push({ f, px, x: tmp.x, y: tmp.y });
    }
    cands.sort((a, b) => b.px - a.px);

    // weniger, dafür lesbare Namen; Flächen der Raumfahrt-Orte sind vorab belegt (keine Überlagerung)
    const maxLabels = Math.min(70, Math.max(14, Math.round((w * h) / 24000)));
    const rects = [...(reserved?.() ?? [])];
    const next = [];
    for (const c of cands) {
      if (next.length >= maxLabels) break;
      const fs = fontSize(c.px);
      const hw = (c.f.name.length * fs * 0.58 + 14) / 2; // etwas Luft zwischen den Namen
      const hh = fs / 2 + 5;
      const r = [c.x - hw, c.y - hh, c.x + hw, c.y + hh];
      if (rects.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      rects.push(r);
      next.push(c.f);
      let L = c.f.label;
      if (!L) {
        L = c.f.label = labels.add({
          position: c.f.pos, text: c.f.name, id: c.f.i, font: `600 ${fs}px Inter, system-ui, sans-serif`,
          fillColor: c.f.i === selected ? ACCENT : colors[c.f.cls], outlineColor: OUTLINE, outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: HorizontalOrigin.CENTER, verticalOrigin: VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        L.fs = fs;
      } else if (L.fs !== fs) {
        L.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        L.fs = fs;
      }
      L.show = true;
    }
    const keep = new Set(next);
    for (const f of shown) if (!keep.has(f) && f.label) f.label.show = false;
    shown = next;
  }

  function tick() {
    if (!enabled) return;
    const now = performance.now();
    if (now - lastTime < 110) return;
    const pos = camera.positionWC;
    const moved = Cartesian3.distance(pos, last.pos) > Math.max(0.5, (Cartesian3.magnitude(pos) - radius) * 0.003)
      || Cartesian3.distance(camera.directionWC, last.dir) > 8e-4
      || canvas.clientWidth !== last.w || canvas.clientHeight !== last.h;
    if (!moved) return;
    lastTime = now;
    Cartesian3.clone(pos, last.pos);
    Cartesian3.clone(camera.directionWC, last.dir);
    last.w = canvas.clientWidth;
    last.h = canvas.clientHeight;
    refresh();
  }
  const unsub = scene.postRender.addEventListener(tick);
  const unsubMorph = scene.morphComplete.addEventListener(() => { last.w = -1; });

  async function load() {
    if (!hasNames(bodyId)) return null;
    const data = (await loaders[keyOf(bodyId)]()).default;
    if (viewer.isDestroyed()) return null;
    feats = data.f.map(([name, lat, lon, km, t, gid], i) => {
      const type = data.types[t];
      const { de, cls } = typeInfo(type);
      const pos = Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
      return { i, name, lat, lon, km: km || 1, type, de, cls, gid, pos, n: Cartesian3.normalize(pos, new Cartesian3()), label: null };
    });
    last.w = -1;
    return { count: feats.length, total: data.total };
  }

  return {
    load,
    setEnabled(on) {
      enabled = on;
      if (!on) { for (const f of shown) if (f.label) f.label.show = false; shown = []; } else last.w = -1;
    },
    // Treffer von scene.pick → Merkmal (oder null)
    fromPick(picked) {
      return picked && picked.primitive && labels.contains(picked.primitive) ? feats[picked.id] ?? null : null;
    },
    select(f) {
      const prev = feats[selected];
      selected = f ? f.i : -1;
      if (prev?.label) prev.label.fillColor = colors[prev.cls];
      if (f?.label) f.label.fillColor = ACCENT;
    },
    flyTo(f, nav) {
      nav.flyToPoint(f.pos, 0.4, Math.min(radius * 4, Math.max(f.km * 2200, 4000)));
    },
    dispose() { unsub(); unsubMorph(); },
  };
}
