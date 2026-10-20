// „Erde live“ – abgespeckte Live-Lage auf der Erdkarte (Ideen nach bilawalsidhu/gods-eye-view, MIT):
// Erdbeben (USGS), Feuer (NASA FIRMS), Raketenstarts (Launch Library 2), Flugzeuge (adsb.lol), Wolken/Niederschlag
// (NASA GIBS) und „Was fliegt heute über mich?“ (Überflüge aus den CelesTrak-Bahnelementen der Satelliten-Ebene).
// Alle Daten kommen über eigene Proxys unter /api/* (hinter dem Passwortschutz, CDN-Cache). Der eigene Standort
// verlässt den Browser nicht: Überflüge werden lokal berechnet; nur eine eingetippte Ortssuche geht an Nominatim.
// Bewusst nicht enthalten: Kameras, Personensuche, Verfolgung einzelner Personen, KI-/Sprachmodelle.
import {
  Cartesian2, Cartesian3, Color, NearFarScalar, LabelStyle, VerticalOrigin, HorizontalOrigin, PrimitiveCollection,
  PointPrimitiveCollection, BillboardCollection, LabelCollection, ImageryLayer, UrlTemplateImageryProvider,
  WebMercatorTilingScheme, Credit, DistanceDisplayCondition, Math as CMath,
} from 'cesium';
import { every } from '../../lib/live.js';
import { passesFor } from '../../lib/passes.js';
import { loadTle, SATS } from './satLayer.js';
import { lang } from '../../i18n/i18n.js';

const EN = lang === 'en';
const LOC = EN ? 'en-GB' : 'de-DE';
// Zusammengesetzte Live-Texte direkt zweisprachig (feste Texte übersetzt src/i18n/en.json wie überall)
const tr = (de, en) => (EN ? en : de);
const latLon = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? tr('O', 'E') : 'W'}`;
const STORE_KEY = 'galactic.earthlive';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* privater Modus */ } },
};
const fmt = (n, d = 0) => n.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null && c !== false) n.append(c);
  return n;
};
async function api(path, signal) {
  const r = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const OFFLINE = 'Quelle gerade nicht erreichbar';

// --- Farben & Legenden --------------------------------------------------------------------------------
const QUAKE_STEPS = [[6, '#ff3b5c', 'ab M 6'], [4.5, '#ff8c42', 'M 4,5–6'], [3, '#ffd166', 'M 3–4,5'], [-9, '#7fd3ff', 'unter M 3']];
const quakeColor = (m) => QUAKE_STEPS.find(([min]) => m >= min)[1];
const FIRE_STEPS = [[50, '#ff3d2e', 'stark (FRP ≥ 50 MW)'], [10, '#ff8a3d', 'mittel (10–50 MW)'], [-1, '#ffcc55', 'schwach (< 10 MW)']];
const fireColor = (frp) => FIRE_STEPS.find(([min]) => frp >= min)[1];
const AC_STEPS = [[30000, '#9fc4ff', 'über 9 000 m'], [10000, '#5ee0c8', '3 000–9 000 m'], [1, '#ffd166', 'unter 3 000 m'], [-1, '#9aa3b5', 'am Boden']];
const acColor = (a) => (a.ground ? AC_STEPS[3][1] : AC_STEPS.find(([min]) => (a.alt ?? 0) >= min)[1]);
const LAUNCH_COLOR = '#b98cff';

const DIRS = { de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'], en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] };
const compass = (az) => DIRS[lang === 'en' ? 'en' : 'de'][Math.round((((az % 360) + 360) % 360) / 45) % 8];
function countdown(ms) {
  const s = Math.round(Math.abs(ms) / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `T${ms > 0 ? '−' : '+'} ${d ? `${d} d ` : ''}${hms}`;
}
const shortCountdown = (ms) => {
  if (ms < 0) return 'T+';
  const h = ms / 3600000;
  return h < 1 ? `T− ${Math.ceil(ms / 60000)} min` : h < 48 ? `T− ${Math.round(h)} h` : `T− ${Math.round(h / 24)} d`;
};
const timeStr = (t, opts = {}) => new Date(t).toLocaleString(LOC, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', ...opts });
const agoStr = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  const v = m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} ${tr('Tagen', 'days')}`;
  return tr(`vor ${v}`, `${v} ago`);
};

// Flugzeug-Symbol (weiß, Nase nach oben = Norden), wird je Höhe eingefärbt
let planeImg = null;
function planeIcon() {
  if (planeImg) return planeImg;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.translate(16, 16); g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1.6; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -14); g.lineTo(2.2, -9); g.lineTo(2.2, -3); g.lineTo(13, 3); g.lineTo(13, 6); g.lineTo(2.2, 3); g.lineTo(2, 9);
  g.lineTo(5.5, 12); g.lineTo(5.5, 14); g.lineTo(0, 12.5); g.lineTo(-5.5, 14); g.lineTo(-5.5, 12); g.lineTo(-2, 9); g.lineTo(-2.2, 3);
  g.lineTo(-13, 6); g.lineTo(-13, 3); g.lineTo(-2.2, -3); g.lineTo(-2.2, -9); g.closePath();
  g.stroke(); g.fill();
  return (planeImg = c);
}

// Uhrzeit eines Überflugs; liegt er nicht mehr heute, mit Wochentag
const passTime = (t) => {
  const d = new Date(t);
  return d.toLocaleString(LOC, { ...(d.toDateString() !== new Date().toDateString() && { weekday: 'short' }), hour: '2-digit', minute: '2-digit' });
};
const ymdUtc = (d) => d.toISOString().slice(0, 10);
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export function createEarthLive({ viewer, ellipsoid, root }) {
  const { scene, camera } = viewer;
  const prefs = { quakeRange: 'day', on: {}, ...store.get() };
  const save = () => store.set({ quakeRange: prefs.quakeRange, on: prefs.on });
  const group = scene.primitives.add(new PrimitiveCollection());
  const stops = [];
  let disposed = false, selected = null, lastActive = Date.now();
  const data = {};
  const pos = (lat, lon, h = 0) => Cartesian3.fromDegrees(lon, lat, h, ellipsoid);
  const render = () => scene.requestRender();

  // --- Oberfläche: Knopf + Ebenen-Panel + Info-Karte -------------------------------------------------------
  const btn = el('button', { type: 'button', class: 'sites-toggle el-toggle', title: 'Erde live: Erdbeben, Feuer, Starts, Flugzeuge, Wetter, Überflüge', 'aria-expanded': 'false' }, '🌍 Erde live');
  const panel = el('section', { class: 'el-panel', hidden: true, 'aria-label': 'Erde live' });
  const pop = el('div', { class: 'site-pop el-pop', hidden: true });
  root.append(btn, panel, pop);
  const setOpen = (o) => { panel.hidden = !o; btn.classList.toggle('on', o || Object.values(prefs.on).some(Boolean)); btn.setAttribute('aria-expanded', String(o)); };
  btn.onclick = () => setOpen(panel.hidden);
  panel.addEventListener('pointerdown', () => { lastActive = Date.now(); });

  const legend = (steps, shape = 'dot') => el('div', { class: `el-legend ${shape}` }, ...steps.map(([, c, label]) => el('span', { style: `--c:${c}`, text: label })));
  const rows = {};
  function row(k, title, opts = {}) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!prefs.on[k];
    const stat = el('span', { class: 'el-stat', text: 'aus' });
    const extra = el('div', { class: 'el-extra' }, ...(opts.extra ?? []));
    const r = el('div', { class: 'el-row', 'data-k': k },
      el('label', { class: 'el-sw' }, cb, el('span', { class: 'el-knob', 'aria-hidden': 'true' }), el('span', { class: 'el-name', text: title })),
      stat, extra,
      opts.src ? el('p', { class: 'el-src' }, 'Quelle: ', el('a', { href: opts.src[1], target: '_blank', rel: 'noopener noreferrer', text: opts.src[0] }), opts.src[2] ? ` · ${opts.src[2]}` : '') : null);
    cb.onchange = () => { prefs.on[k] = cb.checked; save(); r.classList.toggle('on', cb.checked); setOpen(true); layers[k].toggle(cb.checked); };
    r.classList.toggle('on', cb.checked);
    rows[k] = { r, cb, stat, extra };
    return r;
  }
  const status = (k, text, kind = '') => { const s = rows[k]?.stat; if (s) { s.textContent = text; s.className = `el-stat ${kind}`; } };

  const rangeSel = el('select', { class: 'el-select', 'aria-label': 'Zeitraum der Erdbeben' },
    el('option', { value: 'day', text: 'Letzte 24 h (alle)' }), el('option', { value: 'week', text: 'Letzte 7 Tage (ab M 2,5)' }));
  rangeSel.value = prefs.quakeRange;
  rangeSel.onchange = () => { prefs.quakeRange = rangeSel.value; save(); if (prefs.on.quakes) layers.quakes.load(); };
  const launchList = el('ol', { class: 'el-list' });
  const passBox = el('div', { class: 'el-passes' });

  panel.append(
    el('header', {}, el('b', { text: 'Erde live' }), el('button', { type: 'button', class: 'site-x', 'aria-label': 'Schließen', onclick: () => setOpen(false) }, '×')),
    el('p', { class: 'el-intro', text: 'Öffentliche Live-Daten auf dem Globus. Ebenen ein-/ausschalten, Punkte antippen für Details.' }),
    row('quakes', 'Erdbeben', { extra: [rangeSel, legend(QUAKE_STEPS)], src: ['USGS', 'https://earthquake.usgs.gov/earthquakes/feed/', 'gemeinfrei'] }),
    row('fires', 'Waldbrände & Hitzepunkte (24 h)', { extra: [legend(FIRE_STEPS)], src: ['NASA FIRMS', 'https://firms.modaps.eosdis.nasa.gov/', 'MODIS, NASA-Open-Data'] }),
    row('launches', 'Raketenstarts', { extra: [launchList, el('a', { class: 'el-link', href: '#/ops/timeline', text: 'Zur Missions-Zeitleiste →' })], src: ['The Space Devs – Launch Library 2', 'https://thespacedevs.com/llapi'] }),
    row('aircraft', 'Flugzeuge (Ausschnitt)', { extra: [legend(AC_STEPS, 'plane'), el('p', { class: 'el-note', text: 'Öffentliche ADS-B-Signale im Umkreis von ~460 km um die Kartenmitte, höchstens 300. Halter mit Privatsphäre-Wunsch (PIA/LADD) ohne Kennung.' })], src: ['adsb.lol', 'https://adsb.lol/', 'ODbL'] }),
    row('clouds', 'Wolken (Satellitenbild, Vortag)', { extra: [el('p', { class: 'el-note', text: 'NOAA-20 VIIRS Echtfarben, ein Mosaik pro Tag.' })], src: ['NASA GIBS', 'https://www.earthdata.nasa.gov/gibs', 'NASA-Open-Data'] }),
    row('rain', 'Niederschlag (IMERG, 30 min)', { extra: [el('div', { class: 'el-ramp' }, el('span', { text: 'schwach' }), el('i'), el('span', { text: 'stark' })), el('p', { class: 'el-note', text: 'Satelliten-Niederschlagsschätzung, einige Stunden Verzug.' })], src: ['NASA GIBS (GPM IMERG)', 'https://www.earthdata.nasa.gov/gibs', 'NASA-Open-Data'] }),
    row('passes', 'Überflüge: Was fliegt heute über mich?', { extra: [passBox], src: ['CelesTrak', 'https://celestrak.org/', 'SGP4-Berechnung im Browser'] }),
  );

  // --- Info-Karte ------------------------------------------------------------------------------------------
  function closePop() { selected = null; pop.hidden = true; }
  function showPop(kind, color, title, lines, actions = []) {
    pop.replaceChildren(
      el('button', { type: 'button', class: 'site-x', 'aria-label': 'Schließen', onclick: closePop }, '×'),
      el('p', { class: 'site-kind', style: `--c:${color}`, text: kind }),
      el('h3', { text: title }),
      ...lines.filter(Boolean).map((l) => (typeof l === 'string' ? el('p', { class: 'site-meta', text: l }) : l)),
      actions.length ? el('div', { class: 'site-actions' }, ...actions) : null);
    pop.hidden = false;
  }
  const flyBtn = (lat, lon, h) => el('button', { type: 'button', onclick: () => camera.flyTo({ destination: pos(lat, lon, h), duration: 1.8 }) }, 'Hinfliegen');
  const srcLink = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'site-src', text });

  // --- Ebene: Erdbeben -----------------------------------------------------------------------------------
  const quakePts = group.add(new PointPrimitiveCollection());
  const quakes = {
    async load() {
      status('quakes', 'lädt …');
      try {
        data.quakes = await api(`/api/quakes?range=${prefs.quakeRange}`);
        quakePts.removeAll();
        data.quakes.quakes.forEach((q, i) => quakePts.add({
          position: pos(q.lat, q.lon, 0), pixelSize: Math.max(4, 3 + q.mag * 2.4), color: Color.fromCssColorString(quakeColor(q.mag)).withAlpha(0.85),
          outlineColor: Color.BLACK.withAlpha(0.6), outlineWidth: 1, disableDepthTestDistance: 5e5,
          scaleByDistance: new NearFarScalar(1e5, 1.4, 2e7, 0.8), id: { el: 'quake', i },
        }));
        const strong = data.quakes.quakes[0];
        status('quakes', `${fmt(data.quakes.count)} ${tr('Beben', 'quakes')}${strong ? ` · ${tr('stärkstes', 'strongest')} M ${fmt(strong.mag, 1)}` : ''}`, 'ok');
      } catch { status('quakes', OFFLINE, 'bad'); }
      render();
    },
    toggle(on) { quakePts.show = on; if (on) { if (!data.quakes) this.load(); else status('quakes', `${fmt(data.quakes.count)} ${tr('Beben', 'quakes')}`, 'ok'); } else status('quakes', 'aus'); render(); },
    pick(i) {
      const q = data.quakes.quakes[i];
      showPop(`${tr('Erdbeben', 'Earthquake')} · ${agoStr(q.time)}`, quakeColor(q.mag), `M ${fmt(q.mag, 1)} – ${q.place || 'ohne Ortsangabe'}`, [
        `${timeStr(q.time, { second: '2-digit' })} · ${tr('Tiefe', 'depth')} ${fmt(q.depth, 0)} km`,
        latLon(q.lat, q.lon),
        q.tsunami ? el('p', { class: 'site-note el-warn', text: 'Tsunami-Hinweis im USGS-Datensatz gesetzt – offizielle Warnungen der Behörden beachten.' }) : null,
      ], [flyBtn(q.lat, q.lon, 6e5), q.url && srcLink(q.url, 'USGS-Ereignisseite ↗')]);
    },
  };

  // --- Ebene: Feuer (FIRMS) ---------------------------------------------------------------------------
  const firePts = group.add(new PointPrimitiveCollection());
  const fires = {
    async load() {
      status('fires', 'lädt …');
      try {
        data.fires = await api('/api/fires');
        firePts.removeAll();
        data.fires.fires.forEach(([lat, lon, frp], i) => firePts.add({
          position: pos(lat, lon, 0), pixelSize: frp >= 50 ? 5 : frp >= 10 ? 4 : 3, color: Color.fromCssColorString(fireColor(frp)).withAlpha(0.9),
          disableDepthTestDistance: 5e5, scaleByDistance: new NearFarScalar(2e5, 1.8, 2e7, 0.7), id: { el: 'fire', i },
        }));
        status('fires', `${fmt(data.fires.count)} ${tr('Hitzepunkte', 'hotspots')}`, 'ok');
      } catch { status('fires', OFFLINE, 'bad'); }
      render();
    },
    toggle(on) { firePts.show = on; if (on) { if (!data.fires) this.load(); else status('fires', `${fmt(data.fires.count)} ${tr('Hitzepunkte', 'hotspots')}`, 'ok'); } else status('fires', 'aus'); render(); },
    pick(i) {
      const [lat, lon, frp, conf, t, dn] = data.fires.fires[i];
      showPop('Hitzepunkt · NASA FIRMS', fireColor(frp), `${tr('Feuer-Strahlungsleistung', 'Fire radiative power')} ${fmt(frp, 1)} MW`, [
        `${tr('Erfasst', 'Detected')} ${t.slice(3, 5)}.${t.slice(0, 2)}. ${t.slice(6, 8)}:${t.slice(8, 10)} UTC · ${dn === 'N' ? tr('Nachtüberflug', 'night pass') : tr('Tagüberflug', 'day pass')}`,
        `${tr('Konfidenz', 'Confidence')} ${conf} % · ${latLon(lat, lon)}`,
        el('p', { class: 'site-note', text: 'Satellit (MODIS) erkennt Wärme – das kann ein Wald-/Flächenbrand, aber auch Industrie oder Abfackeln sein.' }),
      ], [flyBtn(lat, lon, 1.5e5), srcLink('https://firms.modaps.eosdis.nasa.gov/map/', 'FIRMS-Karte ↗')]);
    },
  };

  // --- Ebene: Raketenstarts ---------------------------------------------------------------------------
  const launchPts = group.add(new PointPrimitiveCollection());
  const launchLabels = group.add(new LabelCollection());
  const upcoming = () => (data.launches?.launches ?? []).filter((l) => Date.parse(l.net) > Date.now() - 6 * 3600000);
  const launches = {
    pads: [],
    async load() {
      status('launches', 'lädt …');
      try {
        data.launches = await api('/api/launches');
        this.build();
      } catch { status('launches', OFFLINE, 'bad'); }
    },
    build() {
      launchPts.removeAll(); launchLabels.removeAll();
      const byPad = new Map();
      // ein Marker je Startgelände (mehrere Rampen zusammengefasst)
      for (const l of upcoming()) { const k = l.pad.location || `${l.pad.lat},${l.pad.lon}`; if (!byPad.has(k)) byPad.set(k, []); byPad.get(k).push(l); }
      this.pads = [...byPad.values()];
      this.pads.forEach((ls, i) => {
        const p = ls[0].pad;
        launchPts.add({ position: pos(p.lat, p.lon, 0), pixelSize: 11, color: Color.fromCssColorString(LAUNCH_COLOR), outlineColor: Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: 5e5, id: { el: 'pad', i } });
        launchLabels.add({ position: pos(p.lat, p.lon, 0), text: '', font: '600 12px Inter, system-ui, sans-serif', fillColor: Color.fromCssColorString('#e7dcff'),
          outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: 5e5, distanceDisplayCondition: new DistanceDisplayCondition(0, 9e6), id: { el: 'pad', i } });
      });
      const list = upcoming();
      launchList.replaceChildren(...list.slice(0, 6).map((l) => {
        const i = this.pads.findIndex((ls) => ls.includes(l));
        return el('li', {}, el('button', { type: 'button', class: 'el-item', onclick: () => { selected = { el: 'pad', i, l }; this.pick(i, l); camera.flyTo({ destination: pos(l.pad.lat, l.pad.lon, 1.2e6), duration: 1.8 }); } },
          el('span', { class: 'el-cd', 'data-net': l.net }), el('b', { text: l.name }), el('small', { text: `${l.pad.location || l.pad.name} · ${l.status}` })));
      }));
      status('launches', list.length ? `${list.length} ${tr('geplant · nächster', 'scheduled · next')} ${shortCountdown(Date.parse(list[0].net) - Date.now())}` : 'keine Termine', 'ok');
      this.tick(); render();
    },
    tick() {
      const now = Date.now();
      launchLabels.show = launchPts.show;
      for (let i = 0; i < launchLabels.length; i++) {
        const l = this.pads[i]?.[0];
        if (l) launchLabels.get(i).text = `${l.rocket || l.name.split('|')[0].trim()} · ${shortCountdown(Date.parse(l.net) - now)}`;
      }
      launchList.querySelectorAll('.el-cd').forEach((s) => { s.textContent = countdown(Date.parse(s.dataset.net) - now); });
      if (selected?.el === 'pad') { const c = pop.querySelector('.el-cd'); if (c) c.textContent = countdown(Date.parse(c.dataset.net) - now); }
      render();
    },
    toggle(on) { launchPts.show = launchLabels.show = on; if (on) { if (!data.launches) this.load(); else this.build(); } else status('launches', 'aus'); render(); },
    pick(i, chosen) {
      const ls = this.pads[i]; if (!ls) return;
      const l = chosen ?? ls[0];
      showPop(`${tr('Raketenstart', 'Launch')} · ${l.statusName || l.status}`, LAUNCH_COLOR, l.name, [
        el('p', { class: 'site-meta el-cd el-big', 'data-net': l.net, text: countdown(Date.parse(l.net) - Date.now()) }),
        `${timeStr(l.net)}${l.precision && l.precision !== 'SEC' && l.precision !== 'MIN' ? tr(' (Termin noch ungenau)', ' (date not yet firm)') : ''}`,
        [l.provider, l.rocket].filter(Boolean).join(' · '),
        `${l.pad.name} · ${l.pad.location}`,
        l.mission ? `Mission: ${l.mission}${l.orbit ? ` → ${l.orbit}` : ''}` : null,
        l.desc ? el('p', { class: 'site-desc', text: l.desc }) : null,
        ls.length > 1 ? el('p', { class: 'site-note', text: `${tr('Weitere Starts hier', 'More launches here')}: ${ls.filter((x) => x !== l).slice(0, 3).map((x) => `${x.name} (${timeStr(x.net, { weekday: undefined, hour: undefined, minute: undefined })})`).join(', ')}` }) : null,
      ], [flyBtn(l.pad.lat, l.pad.lon, 4e4), el('a', { href: '#/ops/timeline', class: 'site-src', text: 'Missions-Zeitleiste' })]);
    },
  };

  // --- Ebene: Flugzeuge ------------------------------------------------------------------------------
  const planes = group.add(new BillboardCollection({ scene }));
  const MAX_CAM_KM = 2500;
  const cameraCenter = () => {
    const c = camera.pickEllipsoid(new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2), ellipsoid);
    const carto = c ? ellipsoid.cartesianToCartographic(c) : camera.positionCartographic;
    return { lat: CMath.toDegrees(carto.latitude), lon: CMath.toDegrees(carto.longitude), h: camera.positionCartographic.height };
  };
  const aircraft = {
    cell: null, timer: null,
    async load(force = false) {
      if (!prefs.on.aircraft) return;
      const c = cameraCenter();
      if (c.h > MAX_CAM_KM * 1000) { planes.removeAll(); data.aircraft = null; this.cell = null; status('aircraft', tr(`näher heranzoomen (unter ${fmt(MAX_CAM_KM)} km Höhe)`, `zoom in closer (below ${fmt(MAX_CAM_KM)} km altitude)`), 'warn'); render(); return; }
      if (Date.now() - lastActive > 15 * 60000) { status('aircraft', 'pausiert – Karte bewegen zum Fortsetzen', 'warn'); return; }
      const cell = `${Math.round(c.lat / 2) * 2},${Math.round(c.lon / 2) * 2}`;
      if (!force && cell === this.cell && data.aircraft && Date.now() - data.aircraft.at < 15000) return;
      if (!data.aircraft) status('aircraft', 'lädt …');
      try {
        const [la, lo] = cell.split(',');
        const d = await api(`/api/aircraft?lat=${la}&lon=${lo}`);
        if (!prefs.on.aircraft) return;
        data.aircraft = { ...d, at: Date.now() };
        this.cell = cell;
        this.build();
        status('aircraft', `${fmt(d.count)}${d.total > d.count ? ` ${tr('von', 'of')} ${fmt(d.total)}` : ''} ${tr('Flugzeuge im Ausschnitt', 'aircraft in view')}`, 'ok');
      } catch { status('aircraft', OFFLINE, 'bad'); }
    },
    build() {
      planes.removeAll();
      const img = planeIcon();
      data.aircraft.aircraft.forEach((a, i) => planes.add({
        image: img, position: pos(a.lat, a.lon, a.ground ? 0 : Math.max(0, (a.alt ?? 0) * 0.3048)), color: Color.fromCssColorString(acColor(a)),
        rotation: -CMath.toRadians(a.track ?? 0), alignedAxis: Cartesian3.UNIT_Z, scale: 0.62, disableDepthTestDistance: 5e5,
        scaleByDistance: new NearFarScalar(5e4, 1.3, 3e6, 0.55), id: { el: 'plane', i },
      }));
      if (selected?.el === 'plane') closePop();
      render();
    },
    toggle(on) {
      planes.show = on;
      if (on) { lastActive = Date.now(); this.load(true); } else { planes.removeAll(); data.aircraft = null; this.cell = null; status('aircraft', 'aus'); }
      render();
    },
    pick(i) {
      const a = data.aircraft.aircraft[i];
      const ft = a.alt ?? 0;
      showPop(`${tr('Flugzeug', 'Aircraft')} · ${a.ground ? tr('am Boden', 'on ground') : tr('in der Luft', 'airborne')}`, acColor(a), a.flight || a.reg || (a.hex ? a.hex.toUpperCase() : tr('ohne Kennung', 'no identifier')), [
        [a.reg && `${tr('Kennzeichen', 'Registration')} ${a.reg}`, a.type && `${tr('Typ', 'Type')} ${a.type}`, a.hex && `ICAO ${a.hex.toUpperCase()}`].filter(Boolean).join(' · ') || 'Kennung auf Wunsch des Halters ausgeblendet',
        el('p', { class: 'site-meta sat-live', text: a.ground ? tr('am Boden', 'on ground') : `${tr('Höhe', 'Altitude')} ${fmt(Math.round(ft * 0.3048))} m (${fmt(ft)} ft)${a.vr ? ` · ${a.vr > 0 ? tr('steigt', 'climbing') : tr('sinkt', 'descending')} ${fmt(Math.abs(a.vr))} ft/min` : ''}` }),
        el('p', { class: 'site-meta sat-live', text: `${a.gs != null ? `${fmt(a.gs * 1.852)} km/h (${a.gs} kn)` : tr('Geschwindigkeit unbekannt', 'speed unknown')}${a.track != null ? ` · ${tr('Kurs', 'track')} ${a.track}° (${compass(a.track)})` : ''}` }),
        el('p', { class: 'site-note', text: 'Öffentliche ADS-B-Daten, Stand vor wenigen Sekunden. Keine Verfolgung einzelner Flüge über die Zeit.' }),
      ], [srcLink('https://adsb.lol/', 'Daten: adsb.lol (ODbL)')]);
    },
  };
  stops.push(every(20000, () => aircraft.load(), { skip: () => !prefs.on.aircraft }));
  let moveT = 0;
  const onMoveEnd = () => { lastActive = Date.now(); clearTimeout(moveT); moveT = setTimeout(() => prefs.on.aircraft && aircraft.load(), 600); };
  stops.push(camera.moveEnd.addEventListener(onMoveEnd));

  // --- Ebenen: Wetter (NASA GIBS) -------------------------------------------------------------------------
  const wx = { clouds: null, rain: null };
  let rainTime = null;
  async function makeWx(k) {
    if (k === 'clouds') {
      const day = ymdUtc(new Date(Date.now() - 86400000));
      return { provider: new UrlTemplateImageryProvider({ url: `${GIBS}/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        tilingScheme: new WebMercatorTilingScheme({ ellipsoid }), maximumLevel: 8, credit: new Credit('NASA GIBS · NOAA-20 VIIRS', false) }), alpha: 0.62, label: `${tr('Mosaik vom', 'Mosaic of')} ${new Date(`${day}T12:00:00Z`).toLocaleDateString(LOC)}` };
    }
    const t = await api('/api/rain-time');
    rainTime = t.time;
    return { provider: new UrlTemplateImageryProvider({ url: `${GIBS}/IMERG_Precipitation_Rate_30min/default/${t.time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }), maximumLevel: 6, credit: new Credit('NASA GIBS · GPM IMERG', false) }), alpha: 0.85,
      label: `${tr('Stand', 'As of')} ${timeStr(t.time, { weekday: undefined, day: undefined, month: undefined })} (${agoStr(Date.parse(t.time))})` };
  }
  const wxLayer = (k) => ({
    async toggle(on) {
      if (wx[k]) { viewer.imageryLayers.remove(wx[k].layer, true); wx[k] = null; }
      if (!on) { status(k, 'aus'); render(); return; }
      status(k, 'lädt …');
      try {
        const w = await makeWx(k);
        if (!prefs.on[k] || disposed) return;
        wx[k] = { ...w, layer: viewer.imageryLayers.add(new ImageryLayer(w.provider, { alpha: w.alpha })) };
        status(k, w.label, 'ok');
      } catch { status(k, OFFLINE, 'bad'); }
      render();
    },
  });
  // Nach einem Wechsel der Grundkarte (setLayer entfernt alle Bildebenen) wieder einhängen
  function reapplyImagery() {
    for (const k of ['clouds', 'rain']) {
      if (!wx[k]) continue;
      wx[k].layer = viewer.imageryLayers.add(new ImageryLayer(wx[k].provider, { alpha: wx[k].alpha }));
    }
  }
  stops.push(every(30 * 60000, () => { if (prefs.on.rain && rainTime) api('/api/rain-time').then((t) => { if (t.time !== rainTime && prefs.on.rain) layers.rain.toggle(true); }).catch(() => {}); }));

  // --- Überflüge: „Was fliegt heute über mich?“ -----------------------------------------------------------
  const obsPts = group.add(new PointPrimitiveCollection());
  let observer = null, recs = null;
  const passList = el('ol', { class: 'el-list el-pass-list' });
  const passMsg = el('p', { class: 'el-note' });
  const geoBtn = el('button', { type: 'button', class: 'el-btn' }, '📍 Meinen Standort verwenden');
  const placeIn = el('input', { type: 'search', placeholder: 'Ort oder Breite, Länge (z. B. 52.52, 13.40)', 'aria-label': 'Ort für Überflüge', autocomplete: 'off', maxlength: '120' });
  const placeForm = el('form', { class: 'el-form' }, placeIn, el('button', { type: 'submit', class: 'el-btn' }, 'Berechnen'));
  passBox.append(
    el('p', { class: 'el-note', text: '„sichtbar“: Raumstation bzw. Hubble im Sonnenlicht bei dunklem Himmel – mit bloßem Auge zu sehen. Standort nur nach deiner Zustimmung (Browser fragt nach). Er bleibt in diesem Browser – die Überflüge werden lokal berechnet und nicht gespeichert.' }),
    geoBtn, placeForm, passMsg, passList);
  geoBtn.onclick = () => {
    if (!navigator.geolocation) { passMsg.textContent = 'Standortabfrage wird von diesem Browser nicht unterstützt – bitte Ort eingeben.'; return; }
    passMsg.textContent = 'Warte auf Standortfreigabe …';
    navigator.geolocation.getCurrentPosition(
      (p) => setObserver(p.coords.latitude, p.coords.longitude, 'Mein Standort'),
      () => { passMsg.textContent = 'Kein Standort freigegeben – du kannst stattdessen einen Ort eingeben.'; },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 });
  };
  placeForm.onsubmit = async (e) => {
    e.preventDefault();
    const q = placeIn.value.trim();
    if (!q) return;
    const m = /^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/.exec(q);
    if (m) {
      const la = +m[1].replace(',', '.'), lo = +m[2].replace(',', '.');
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return setObserver(la, lo, `${la.toFixed(2)}°, ${lo.toFixed(2)}°`);
    }
    passMsg.textContent = 'Suche Ort …';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${lang}&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const [hit] = r.ok ? await r.json() : [];
      if (!hit) { passMsg.textContent = 'Ort nicht gefunden.'; return; }
      setObserver(+hit.lat, +hit.lon, hit.display_name.split(',').slice(0, 2).join(','));
    } catch { passMsg.textContent = 'Ortssuche gerade nicht erreichbar – Koordinaten eingeben (z. B. 52.52, 13.40).'; }
  };
  async function setObserver(lat, lon, name) {
    observer = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name };
    obsPts.removeAll();
    obsPts.add({ position: pos(observer.lat, observer.lon, 0), pixelSize: 10, color: Color.fromCssColorString('#3ddc84'), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: 5e5, id: { el: 'obs' } });
    render();
    await computePasses();
  }
  async function computePasses() {
    if (!observer) { status('passes', 'Ort wählen', 'warn'); return; }
    status('passes', 'rechnet …');
    try {
      if (!recs) recs = await loadTle();
      const start = new Date();
      const all = [];
      for (const [id, rec] of recs) for (const p of passesFor(rec, observer.lat, observer.lon, { hours: 24, minEl: 10, start })) all.push({ ...p, id, name: SATS[id].name, kind: SATS[id].kind, visible: p.visible && SATS[id].kind !== 'earth' }); // kleine Erdbeobachter sind kaum mit bloßem Auge zu sehen
      all.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      const issNext = all.find((p) => p.id === 25544 && p.visible) ?? all.find((p) => p.id === 25544);
      passMsg.replaceChildren(el('b', { text: observer.name }), ` · ${latLon(observer.lat, observer.lon)} · ${tr('nächste 24 h, ab 10° über dem Horizont', 'next 24 h, above 10° elevation')}`);
      passList.replaceChildren(...(all.length ? all.slice(0, 14).map((p) => el('li', { class: `${p.id === 25544 ? 'iss' : ''}${p.visible ? ' vis' : ''}` },
        el('span', { class: 'el-time', text: passTime(p.start) }),
        el('b', { text: p.name }),
        el('small', { text: `max ${p.maxEl}° · ${compass(p.azStart)} → ${compass(p.azEnd)} · ${Math.max(1, Math.round((Date.parse(p.end) - Date.parse(p.start)) / 60000))} min` }),
        p.visible ? el('em', { text: 'sichtbar' }) : null)) : [el('li', { class: 'el-empty', text: 'Keine Überflüge über 10° in den nächsten 24 h.' })]));
      status('passes', issNext ? `ISS ${passTime(issNext.start)}${issNext.visible ? tr(' (sichtbar)', ' (visible)') : ''}` : `${all.length} ${tr('Überflüge', 'passes')}`, 'ok');
    } catch { status('passes', OFFLINE, 'bad'); passList.replaceChildren(); }
  }
  stops.push(every(15 * 60000, () => observer && prefs.on.passes && computePasses()));

  const layers = {
    quakes, fires, launches, aircraft, clouds: wxLayer('clouds'), rain: wxLayer('rain'),
    passes: { toggle(on) { obsPts.show = on; passBox.hidden = !on; if (on) computePasses(); else status('passes', 'aus'); render(); } },
  };
  // gespeicherte Ebenen wieder einschalten
  for (const k of Object.keys(layers)) { const on = !!prefs.on[k]; if (on) layers[k].toggle(true); else if (k === 'passes') passBox.hidden = true; else layers[k].toggle?.(false); }
  btn.classList.toggle('on', Object.values(prefs.on).some(Boolean));

  stops.push(every(1000, () => launches.tick(), { skip: () => !prefs.on.launches || !launches.pads.length }));
  stops.push(every(3 * 60000, () => quakes.load(), { skip: () => !prefs.on.quakes }));
  stops.push(every(30 * 60000, () => { if (prefs.on.fires) fires.load(); if (prefs.on.launches) launches.load(); }));

  return {
    reapplyImagery,
    pickAt(p) {
      for (const hit of scene.drillPick(p, 5)) {
        const id = hit?.id;
        if (!id || typeof id !== 'object' || !id.el) continue;
        if (id.el === 'obs') continue;
        selected = id;
        if (id.el === 'quake') quakes.pick(id.i);
        else if (id.el === 'fire') fires.pick(id.i);
        else if (id.el === 'pad') launches.pick(id.i);
        else if (id.el === 'plane') aircraft.pick(id.i);
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      stops.forEach((s) => { try { s(); } catch { /* egal */ } });
      clearTimeout(moveT);
      for (const k of ['clouds', 'rain']) if (wx[k]) viewer.imageryLayers.remove(wx[k].layer, true);
      scene.primitives.remove(group);
      btn.remove(); panel.remove(); pop.remove();
    },
  };
}
