// Reale Raumfahrt-Orte auf der Planeten-/Mondkarte: Landeplätze, Rover, zurückgelassene Instrumente,
// Aufschlagstellen und (für Orbitstationen) ein Hinweis. Daten: src/data/sites.js (mit Quellen).
// Eigene, umschaltbare Ebene mit Detail-Einblendung; getrennt von der nutzereigenen Stationsplanung.
import { Cartesian2, Cartesian3, Color, HeightReference, LabelStyle, SceneMode, VerticalOrigin } from 'cesium';
import { SITES } from '../../data/sites.js';

export const SITE_KINDS = {
  landeplatz: { label: 'Landeplatz', color: '#6ea8ff' },
  rover: { label: 'Rover', color: '#3ddc84' },
  instrument: { label: 'Instrument', color: '#ffcc55' },
  station: { label: 'Station', color: '#b98cff' },
  aufschlag: { label: 'Aufschlag', color: '#ff6b6b' },
  geplant: { label: 'Geplant', color: '#9aa7b8' },
};
const col = (k) => Color.fromCssColorString(SITE_KINDS[k]?.color ?? '#ffffff');

export const sitesFor = (bodyId) => SITES.filter((s) => s.body === bodyId);
// Orte mit Oberflächenposition (Marker auf der Karte); Orbitstationen haben lat/lon = null
export const surfaceSitesFor = (bodyId) => sitesFor(bodyId).filter((s) => s.lat != null && s.lon != null);

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const fmtDeg = (lat, lon) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'O' : 'W'}`;

export function createSitesLayer({ viewer, body, ellipsoid, root, hasTerrain }) {
  const { scene, camera, entities } = viewer;
  const surface = surfaceSitesFor(body.id);
  const items = new Map(); // entity.id → site
  const drawn = [];
  let visible = true;

  const pos = (lat, lon) => Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
  // Kurzname für die Kartenbeschriftung („Apollo 11 – Tranquility Base" → „Apollo 11"); voller Name im Detail
  const shortName = (n) => n.split(' – ')[0].split(' (')[0];
  const PRIO = { station: 0, landeplatz: 1, rover: 2, aufschlag: 3, instrument: 4, geplant: 5 };
  const radius = ellipsoid.maximumRadius;
  const marks = []; // { s, e, pos, n, prio, text }
  function draw() {
    for (const e of drawn) entities.remove(e);
    drawn.length = 0; marks.length = 0; items.clear();
    if (!visible) { scene.requestRender(); return; }
    for (const s of surface) {
      const c = col(s.kind);
      const p = pos(s.lat, s.lon);
      const text = shortName(s.name);
      const e = entities.add({
        position: p,
        point: { pixelSize: 8, color: c, outlineColor: Color.fromCssColorString('#04060d'), outlineWidth: 2,
          heightReference: hasTerrain ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text, show: false, font: '600 11.5px Inter, system-ui, sans-serif', fillColor: c.brighten(0.35, new Color()), outlineColor: Color.fromCssColorString('#04060d'),
          outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: { x: 0, y: -9 },
          disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      items.set(e.id, s);
      drawn.push(e);
      marks.push({ s, e, pos: p, n: Cartesian3.normalize(p, new Cartesian3()), prio: PRIO[s.kind] ?? 9, text });
    }
    last.w = -1;
    layout();
  }

  // Entzerrung: Rückseite (hinter dem Horizont) ausblenden, Beschriftungen ohne Überlappung, Wichtiges zuerst.
  // Die belegten Flächen gibt die Ebene an die IAU-Namen weiter (reservedRects), damit sich nichts überlagert.
  let rects = [];
  const tmp = new Cartesian2();
  const last = { pos: new Cartesian3(), dir: new Cartesian3(), w: 0, h: 0 };
  let lastTime = 0;
  function layout() {
    rects = [];
    if (!visible || !marks.length) return;
    const canvas = scene.canvas, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const is3d = scene.mode === SceneMode.SCENE3D;
    const cam = camera.positionWC, camLen = Cartesian3.magnitude(cam);
    const q = radius / camLen, cosMin = q + 0.02 * (1 - q);
    const cands = [];
    for (const m of marks) {
      const front = !is3d || (m.n.x * cam.x + m.n.y * cam.y + m.n.z * cam.z) / camLen >= cosMin;
      const on = front && !!scene.cartesianToCanvasCoordinates(m.pos, tmp) && tmp.x > -20 && tmp.x < w + 20 && tmp.y > -20 && tmp.y < h + 20;
      if (m.e.show !== on) m.e.show = on;
      m.e.label.show = false;
      if (on) cands.push({ m, x: tmp.x, y: tmp.y });
    }
    cands.sort((a, b) => a.m.prio - b.m.prio);
    const maxLabels = Math.max(8, Math.round((w * h) / 45000));
    let n = 0;
    for (const c of cands) {
      // Punkt selbst reservieren (kleine Fläche), damit IAU-Namen ihn nicht überdecken
      rects.push([c.x - 6, c.y - 6, c.x + 6, c.y + 6]);
      if (n >= maxLabels) continue;
      const hw = (c.m.text.length * 11.5 * 0.56 + 10) / 2;
      const r = [c.x - hw, c.y - 26, c.x + hw, c.y - 6];
      if (rects.some((o) => o !== rects[rects.length - 1] && r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      c.m.e.label.show = true;
      rects.push(r);
      n++;
    }
  }
  function tick() {
    if (!visible) return;
    const now = performance.now();
    if (now - lastTime < 110) return;
    const p = camera.positionWC, cv = scene.canvas;
    const moved = Cartesian3.distance(p, last.pos) > Math.max(0.5, (Cartesian3.magnitude(p) - radius) * 0.003)
      || Cartesian3.distance(camera.directionWC, last.dir) > 8e-4 || cv.clientWidth !== last.w || cv.clientHeight !== last.h;
    if (!moved) return;
    lastTime = now;
    Cartesian3.clone(p, last.pos); Cartesian3.clone(camera.directionWC, last.dir);
    last.w = cv.clientWidth; last.h = cv.clientHeight;
    layout();
    scene.requestRender();
  }
  const unsubTick = scene.postRender.addEventListener(tick);

  // Detail-Einblendung (eigene kleine Box, getrennt vom Merkmals-Popup der Karte)
  const box = el('aside', { class: 'site-pop', hidden: '' });
  root.append(box);
  function showSite(s) {
    box.hidden = false;
    const c = SITE_KINDS[s.kind]?.color ?? '#fff';
    box.replaceChildren(
      el('button', { class: 'site-x', type: 'button', 'aria-label': 'Schließen', onclick: () => { box.hidden = true; } }, '×'),
      el('p', { class: 'site-kind', style: `--c:${c}` }, `${SITE_KINDS[s.kind]?.label ?? s.kind}${s.status ? ' · ' + s.status : ''}`),
      el('h3', { text: s.name }),
      el('p', { class: 'site-meta', text: `${s.agency ?? ''}${s.country ? ' · ' + s.country : ''}${s.year ? ' · ' + s.year : ''}` }),
      el('p', { class: 'site-meta', text: fmtDeg(s.lat, s.lon) }),
      s.purpose ? el('p', { class: 'site-desc', text: s.purpose }) : null,
      s.instruments?.length ? el('p', { class: 'site-desc', text: 'Instrumente: ' + s.instruments.join(', ') }) : null,
      s.note ? el('p', { class: 'site-note', text: s.note }) : null,
      el('div', { class: 'site-actions' },
        el('button', { type: 'button', onclick: () => camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat, 60000, ellipsoid), duration: 1.4 }) }, 'Hinfliegen'),
        s.sourceUrl ? el('a', { href: s.sourceUrl, target: '_blank', rel: 'noopener', text: 'Quelle ↗' }) : el('span', { class: 'site-src', text: s.source ?? '' })),
    );
  }

  draw();
  return {
    // Klick auf der Karte: durchsucht ALLE Objekte am Punkt (ein IAU-Namensetikett kann über dem Marker liegen)
    pickAt(pos) {
      if (!visible) return false;
      for (const p of scene.drillPick(pos, 8)) {
        const s = items.get(p?.id?.id ?? p?.id);
        if (s) { showSite(s); return true; }
      }
      return false;
    },
    setVisible(v) { visible = v; draw(); },
    reservedRects: () => (visible ? rects : []),
    count: surface.length,
    dispose() { unsubTick(); for (const e of drawn) entities.remove(e); box.remove(); },
  };
}
