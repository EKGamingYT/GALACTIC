// Live-Satelliten auf der Erdkarte: ISS, Tiangong, Hubble und ausgewählte Erdbeobachter.
// Bahnelemente (TLE) von CelesTrak über den eigenen Proxy /api/tle (CDN-Cache 2 h), Ausbreitung mit SGP4 (satellite.js).
// Positionen jede Sekunde, Bahnspur (eine Umlaufperiode voraus) alle 30 s; TLEs werden alle 2 h erneuert.
import { Cartesian2, Cartesian3, Color, LabelStyle, VerticalOrigin, NearFarScalar, ArcType } from 'cesium';
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { every } from '../../lib/live.js';

const SATS = {
  25544: { name: 'ISS', agency: 'NASA · Roskosmos · ESA · JAXA · CSA', kind: 'station', info: 'Internationale Raumstation, ständig bemannt seit 2000.' },
  48274: { name: 'Tiangong', agency: 'CMSA (China)', kind: 'station', info: 'Chinesische Raumstation (Kernmodul Tianhe), bemannt seit 2021.' },
  20580: { name: 'Hubble', agency: 'NASA · ESA', kind: 'science', info: 'Weltraumteleskop, gestartet 1990.' },
  25994: { name: 'Terra', agency: 'NASA', kind: 'earth', info: 'Erdbeobachtung (MODIS, ASTER …), gestartet 1999.' },
  27424: { name: 'Aqua', agency: 'NASA', kind: 'earth', info: 'Wasserkreislauf der Erde, gestartet 2002.' },
  49260: { name: 'Landsat 9', agency: 'NASA · USGS', kind: 'earth', info: 'Landoberflächen-Bilder, gestartet 2021.' },
  43013: { name: 'NOAA-20', agency: 'NOAA · NASA', kind: 'earth', info: 'Polarer Wettersatellit (JPSS-1), gestartet 2017.' },
  39634: { name: 'Sentinel-1A', agency: 'ESA · EU (Copernicus)', kind: 'earth', info: 'Radar-Erdbeobachtung, gestartet 2014.' },
};
const KIND_COLOR = { station: '#ffcc55', science: '#b98cff', earth: '#3ddc84' };
const SOURCE = 'https://celestrak.org/NORAD/elements/';

async function loadTle() {
  const get = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
  let text = '';
  try { text = await get('/api/tle'); } catch { /* Dev-Server: kein Proxy */ }
  if (!/^1 \d/m.test(text)) text = await get('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle');
  const lines = text.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const out = new Map();
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
    const id = +lines[i + 1].slice(2, 7);
    if (SATS[id] && !out.has(id)) out.set(id, twoline2satrec(lines[i + 1], lines[i + 2]));
    i += 2;
  }
  return out;
}

function stateAt(rec, date) {
  const pv = propagate(rec, date);
  if (!pv?.position || typeof pv.position === 'boolean') return null;
  const g = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity;
  return { lat: degreesLat(g.latitude), lon: degreesLong(g.longitude), alt: g.height, speed: Math.hypot(v.x, v.y, v.z) };
}

const fmt = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

export function createSatLayer({ viewer, ellipsoid, root }) {
  const { entities, scene } = viewer;
  const sats = new Map(); // id → { rec, point, path, meta }
  let visible = true, selected = null, recs = new Map(), stopPos = null, stopPath = null, stopTle = null, disposed = false;

  const btn = el('button', { type: 'button', class: 'sites-toggle sat-toggle on', title: 'Live-Satelliten ein-/ausblenden', 'aria-pressed': 'true' }, '🛰 Live …');
  btn.onclick = () => { visible = btn.classList.toggle('on'); btn.setAttribute('aria-pressed', String(visible)); apply(); };
  const pop = el('div', { class: 'site-pop sat-pop', hidden: '' });
  root.append(btn, pop);
  if (!root.querySelector('.sites-toggle:not(.sat-toggle)')) btn.classList.add('solo'); // ohne Orte-Knopf rückt er nach oben

  const pos = (s) => Cartesian3.fromDegrees(s.lon, s.lat, s.alt * 1000, ellipsoid);
  function build() {
    for (const s of sats.values()) { entities.remove(s.point); entities.remove(s.path); }
    sats.clear();
    for (const [id, rec] of recs) {
      const meta = SATS[id];
      const col = Color.fromCssColorString(KIND_COLOR[meta.kind]);
      const point = entities.add({
        id: `sat-${id}`, position: Cartesian3.ZERO,
        point: { pixelSize: meta.kind === 'station' ? 9 : 7, color: col, outlineColor: Color.BLACK.withAlpha(0.7), outlineWidth: 1.5 },
        label: { text: meta.name, font: '600 12px Inter, system-ui, sans-serif', fillColor: col, outlineColor: Color.BLACK, outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -9),
          translucencyByDistance: new NearFarScalar(2e6, 1, 4e7, 0.6) },
      });
      const path = entities.add({ polyline: { positions: [], width: 1.4, arcType: ArcType.NONE, material: col.withAlpha(0.45) } });
      sats.set(id, { id, rec, point, path, meta, col, state: null });
    }
    btn.textContent = `🛰 Live (${sats.size})`;
    updatePositions(); updatePaths(); apply();
  }
  function updatePositions() {
    const now = new Date();
    for (const s of sats.values()) {
      s.state = stateAt(s.rec, now);
      if (s.state) s.point.position = pos(s.state);
    }
    if (selected) renderPop();
    scene.requestRender();
  }
  function updatePaths() {
    const t0 = Date.now();
    for (const s of sats.values()) {
      const periodMin = (2 * Math.PI) / s.rec.no; // mittlere Bewegung in rad/min
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const st = stateAt(s.rec, new Date(t0 + (i / 120) * periodMin * 60000));
        if (st) pts.push(pos(st));
      }
      s.path.polyline.positions = pts;
      s.periodMin = periodMin;
    }
    scene.requestRender();
  }
  function apply() {
    for (const s of sats.values()) {
      s.point.show = visible;
      s.path.show = visible && (!selected || selected === s.id);
      s.path.polyline.width = selected === s.id ? 2.4 : 1.4;
    }
    if (!visible) { selected = null; pop.hidden = true; }
    scene.requestRender();
  }
  function renderPop() {
    const s = sats.get(selected);
    if (!s?.state) return;
    const { lat, lon, alt, speed } = s.state;
    const ageH = (Date.now() / 86400000 + 2440587.5 - s.rec.jdsatepoch) * 24;
    pop.replaceChildren(
      el('button', { type: 'button', class: 'site-x', 'aria-label': 'Schließen', onclick: () => { selected = null; pop.hidden = true; apply(); } }, '×'),
      el('p', { class: 'site-kind', style: `--c:${KIND_COLOR[s.meta.kind]}`, text: s.meta.kind === 'station' ? 'Raumstation · live' : 'Satellit · live' }),
      el('h3', { text: s.meta.name }),
      el('p', { class: 'site-meta', text: s.meta.agency }),
      el('p', { class: 'site-meta sat-live', text: `Höhe ${fmt(alt)} km · ${fmt(speed * 3600)} km/h` }),
      el('p', { class: 'site-meta sat-live', text: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'O' : 'W'} · Umlauf ${fmt(s.periodMin, 1)} min` }),
      el('p', { class: 'site-desc', text: s.meta.info }),
      el('p', { class: 'site-note', text: `Bahnelemente ${ageH < 48 ? `${fmt(ageH, 0)} h` : `${fmt(ageH / 24, 0)} Tage`} alt (SGP4-Ausbreitung).` }),
      el('div', { class: 'site-actions' },
        el('button', { type: 'button', onclick: () => viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, (alt + 2500) * 1000, ellipsoid), duration: 2 }) }, 'Hinfliegen'),
        el('a', { href: SOURCE, target: '_blank', rel: 'noopener noreferrer', class: 'site-src', text: 'Daten: CelesTrak' })));
    pop.hidden = false;
  }

  async function refreshTle() {
    try { recs = await loadTle(); if (!disposed && recs.size) build(); }
    catch { if (!sats.size) btn.textContent = '🛰 Live (offline)'; }
  }
  refreshTle();
  stopPos = every(1000, updatePositions, { skip: () => !visible || !sats.size });
  stopPath = every(30000, updatePaths, { skip: () => !visible || !sats.size });
  stopTle = every(2 * 3600 * 1000, refreshTle);

  return {
    pickAt(p) {
      if (!visible) return false;
      for (const hit of scene.drillPick(p, 6)) {
        const id = hit?.id?.id;
        if (typeof id === 'string' && id.startsWith('sat-')) { selected = +id.slice(4); apply(); renderPop(); return true; }
      }
      return false;
    },
    dispose() {
      disposed = true; stopPos(); stopPath(); stopTle();
      for (const s of sats.values()) { entities.remove(s.point); entities.remove(s.path); }
      btn.remove(); pop.remove();
    },
  };
}
