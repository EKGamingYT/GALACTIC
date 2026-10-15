// Ortsnamen der Erde (Staaten + besiedelte Orte) in einer wählbaren Sprache. Daten: Natural Earth (gemeinfrei),
// aufbereitet von scripts/fetch-places.mjs nach src/data/places/ und erst beim Einschalten nachgeladen.
// Sichtbarkeit nach Kartenzoom (Natural-Earth-Zoomstufen MIN_ZOOM bzw. MIN_/MAX_LABEL, aus Meter-pro-Pixel
// umgerechnet), Kollisionsprüfung im Bildschirmraum, Rückseite des Globus wird ausgeblendet.
import {
  Cartesian2, Cartesian3, Color, Credit, HorizontalOrigin, LabelCollection, LabelStyle, PointPrimitiveCollection,
  SceneMode, VerticalOrigin,
} from 'cesium';

// Sprachen der Auswahl (Codes wie in den Datendateien; Reihenfolge der Liste = Anzeige)
export const PLACE_LANGS = [
  ['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
  ['nl', 'Nederlands'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['ru', 'Русский'], ['zh', '中文'], ['ja', '日本語'], ['ar', 'العربية'],
];

const FONT = '"Inter", "Segoe UI", "Noto Sans", system-ui, sans-serif';
const OUTLINE = new Color(0.02, 0.03, 0.07, 0.92);
const COUNTRY_FILL = Color.fromCssColorString('#f4d98a');
const CITY_FILL = Color.fromCssColorString('#ffffff');
const TOWN_FILL = Color.fromCssColorString('#e3e9f5');
const CAPITAL_DOT = Color.fromCssColorString('#ffd166');
const BIAS = 0.4; // Namen erscheinen etwas früher als die Zoomstufe der Quelldaten (Bildschirm-Pixeldichte)

// Textbreite (Pixel) mit Zwischenspeicher – für die Kollisionsprüfung
const measure = (() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map();
  return (text, font) => {
    const key = `${font}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      if (cache.size > 8000) cache.clear();
      cache.set(key, w);
    }
    return w;
  };
})();

export function createPlaces(viewer, { ellipsoid, radius }) {
  const { scene } = viewer;
  const camera = scene.camera;
  const canvas = scene.canvas;
  const labels = scene.primitives.add(new LabelCollection({ scene }));
  const dots = scene.primitives.add(new PointPrimitiveCollection());
  const credit = new Credit('Ortsnamen: Natural Earth (gemeinfrei)', true);
  const mpp0 = (2 * Math.PI * radius) / 256; // Meter pro Pixel bei Zoomstufe 0
  const mppAt = (z) => mpp0 / 2 ** (z - BIAS); // Meter pro Pixel, ab dem Zoomstufe z (mit Vorlauf) erreicht ist
  let feats = [];
  let langs = [];
  let li = 0;
  let enabled = false;
  let loaded = false;
  let shown = [];
  let lastTime = 0;
  const last = { pos: new Cartesian3(), dir: new Cartesian3(), w: 0, h: 0 };
  const tmp = new Cartesian2();

  const textOf = (f) => {
    if (f.txtLang !== li) {
      const name = f.names[li] || f.names[0];
      f.txt = f.country ? name.toLocaleUpperCase(langs[li]) : name;
      f.txtLang = li;
    }
    return f.txt;
  };

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
    const cosMin = q + 0.04 * (1 - q); // Horizont mit kleinem Randabstand
    const k = (2 * Math.tan(camera.frustum.fovy / 2)) / h;
    const mpp2d = is3d ? 0 : (camera.frustum.right - camera.frustum.left) / w;

    const maxLabels = Math.min(170, Math.max(30, Math.round((w * h) / 7000)));
    const rects = [];
    const next = [];
    for (const f of feats) {
      if (next.length >= maxLabels) break;
      if (is3d && (f.n.x * cam.x + f.n.y * cam.y + f.n.z * cam.z) / camLen < cosMin) continue;
      const mpp = is3d ? Cartesian3.distance(cam, f.pos) * k : mpp2d;
      if (mpp > f.maxMpp || mpp < f.minMpp) continue;
      if (!scene.cartesianToCanvasCoordinates(f.pos, tmp)) continue;
      const x = tmp.x;
      const y = tmp.y;
      if (x < -20 || x > w + 20 || y < -12 || y > h + 12) continue;

      const text = textOf(f);
      const fs = f.country ? 13 : f.cap ? 14 : 12.5;
      const font = `${f.country || f.cap ? 600 : 500} ${fs}px ${FONT}`;
      const tw = measure(text, font) + (f.country ? text.length * 1.2 : 0); // Versalien mit Sperrung
      const hh = fs / 2 + 3;
      const r = f.country ? [x - tw / 2 - 5, y - hh, x + tw / 2 + 5, y + hh] : [x - 5, y - hh, x + tw + 14, y + hh];
      if (rects.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      rects.push(r);
      next.push(f);

      let L = f.label;
      if (!L) {
        L = f.label = labels.add({
          position: f.pos, text, font, fillColor: f.country ? COUNTRY_FILL : f.cap ? CITY_FILL : TOWN_FILL,
          outlineColor: OUTLINE, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: f.country ? HorizontalOrigin.CENTER : HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER, pixelOffset: new Cartesian2(f.country ? 0 : 7, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        L.txtLang = li;
        if (!f.country) {
          f.dot = dots.add({
            position: f.pos, pixelSize: f.cap ? 6 : 4.5, color: f.cap ? CAPITAL_DOT : CITY_FILL,
            outlineColor: OUTLINE, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          });
        }
      } else if (L.txtLang !== li) {
        L.text = text;
        L.txtLang = li;
      }
      L.show = true;
      if (f.dot) f.dot.show = true;
    }
    const keep = new Set(next);
    for (const f of shown) {
      if (keep.has(f)) continue;
      if (f.label) f.label.show = false;
      if (f.dot) f.dot.show = false;
    }
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

  function hideAll() {
    for (const f of shown) { if (f.label) f.label.show = false; if (f.dot) f.dot.show = false; }
    shown = [];
  }

  const build = (rows, country) => rows.map((r) => {
    const [lat, lon, a, b, ...names] = r; // beide Dateien: 4 Kopfwerte, dann die Namen
    const pos = Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
    return {
      country, cap: !country && b >= 2, names, pos, n: Cartesian3.normalize(pos, new Cartesian3()),
      // Orte: ab Zoomstufe a sichtbar; Staaten: nur zwischen Zoomstufe a und b
      maxMpp: mppAt(a), minMpp: country ? mppAt(b + 0.8) : 0, label: null, dot: null, txt: '', txtLang: -1,
    };
  });

  // Daten (einmalig) laden; danach Sprache setzen
  async function load(code) {
    const [countries, cities] = await Promise.all([
      import('../../data/places/countries.json'), import('../../data/places/cities.json'),
    ]);
    if (viewer.isDestroyed()) return null;
    langs = cities.default.langs;
    li = Math.max(0, langs.indexOf(code));
    // Staaten zuerst (höhere Priorität bei Überschneidungen), dann Orte nach Wichtigkeit
    feats = [...build(countries.default.f, true), ...build(cities.default.f, false)];
    loaded = true;
    last.w = -1;
    return { count: feats.length };
  }

  return {
    load,
    isLoaded: () => loaded,
    setEnabled(on) {
      enabled = on;
      const cd = viewer.creditDisplay;
      if (on) { cd.addStaticCredit(credit); last.w = -1; } else { try { cd.removeStaticCredit(credit); } catch { /* war nicht gesetzt */ } hideAll(); }
    },
    setLang(code) {
      const i = langs.indexOf(code);
      if (i < 0) return;
      li = i;
      hideAll();
      last.w = -1;
    },
    dispose() { unsub(); unsubMorph(); },
  };
}
