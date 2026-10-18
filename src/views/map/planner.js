// Stationsplanung auf den Planetenkarten:
//  • alle geplanten Stationen und Routen (aus Supabase) als Kreise/Linien auf der Karte, Liste mit Hinfliegen
//  • Werkzeuge für alle: Punkt analysieren (Koordinaten, Höhe wo Gelände vorhanden), Strecke messen
//  • mit Stationsschlüssel (nur Raumfahrtorganisationen, vergeben im Admin-Panel): Station platzieren
//    (Art, Status, Radius, Besatzung, Beschreibung), eigene Stationen bearbeiten/löschen, Routen zeichnen
// Alle Texte aus der Datenbank werden nur über textContent ausgegeben (kein innerHTML mit Fremddaten).
import { every } from '../../lib/live.js';
import { getScales, surfaceRadiationNotice } from '../../lib/spaceWeather.js';
import {
  Cartesian3, Cartographic, Color, HeightReference, LabelStyle, VerticalOrigin, Math as CesiumMath, ConstantProperty,
  sampleTerrainMostDetailed, EllipsoidGeodesic,
} from 'cesium';
import {
  listStations, listRoutes, checkKey, saveStation, deleteStation, saveRoute, deleteRoute, STATION_KINDS, ROUTE_KINDS,
} from '../../lib/stationsApi.js';

const KEY_STORE = 'galactic_station_key';
const COLORS = { geplant: '#ffcc55', 'im Bau': '#ff9a4d', aktiv: '#3ddc84' };
const ROUTE_COLORS = { strasse: '#d6dbe6', schiene: '#b98cff', pipeline: '#ffb86b', kabel: '#6ea8ff', rover: '#3ddc84' };

const el = (tag, props = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};
const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : `${Math.round(m).toLocaleString('de-DE')} m`);
const fmtDeg = (lat, lon) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'O' : 'W'}`;

export function createPlanner({ viewer, body, ellipsoid, root, hasTerrain }) {
  const { scene, camera, entities } = viewer;
  let key = sessionStorage.getItem(KEY_STORE);
  let agency = null;
  let stations = [], routes = [];
  let mode = null;          // null | 'place' | 'route' | 'measure' | 'probe'
  let draft = [];            // Punkte für Route/Messung [{lat, lon}]
  let routeStation = null;   // Station, zu der die Route gehört
  let wxNotice = null;       // Weltraumwetter-Hinweis (nur Mond/Mars)
  const drawn = [];          // Entities der Stationen/Routen
  const temp = [];           // Entities des aktuellen Werkzeugs

  // --- Oberfläche ---------------------------------------------------------------------------------------
  const btn = el('button', { class: 'pl-toggle', type: 'button', title: 'Stationsplanung', 'aria-expanded': 'false' }, '⌂ Planung');
  const panel = el('aside', { class: 'pl-panel', hidden: '' });
  const status = el('p', { class: 'pl-status', role: 'status' });
  root.append(btn, panel);
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) render(); });

  function say(text, kind = '') { status.textContent = text; status.dataset.kind = kind; }

  function render() {
    panel.replaceChildren();
    panel.append(el('header', {}, el('strong', { text: `Stationsplanung · ${body.name}` }),
      el('button', { class: 'pl-x', type: 'button', 'aria-label': 'Schließen', onclick: () => { panel.hidden = true; setMode(null); } }, '×')));
    if (wxNotice) {
      panel.append(el('div', { class: `pl-wx ${wxNotice.level}`, role: 'alert' }, el('b', { text: '☢ Weltraumwetter' }), el('span', { text: wxNotice.text }),
        el('a', { href: '#/ops/weather', class: 'pl-link', text: 'Details' })));
    }

    // Anmeldung der Organisation
    if (agency) {
      panel.append(el('div', { class: 'pl-agency' }, el('span', { text: 'Angemeldet: ' }), el('b', { text: agency.name }),
        el('button', { class: 'pl-link', type: 'button', onclick: logout }, 'Abmelden')));
    } else {
      const input = el('input', { type: 'password', placeholder: 'Stationsschlüssel (GLX-…)', autocomplete: 'off', maxlength: '200', 'aria-label': 'Stationsschlüssel' });
      panel.append(el('form', { class: 'pl-login', onsubmit: (e) => { e.preventDefault(); login(input.value.trim()); } },
        input, el('button', { type: 'submit' }, 'Anmelden')),
        el('p', { class: 'pl-hint', text: 'Nur Raumfahrtorganisationen mit einem im Admin-Panel ausgegebenen Schlüssel können Stationen anlegen.' }));
    }

    // Werkzeuge
    const tools = el('div', { class: 'pl-tools' });
    const tool = (id, label, needsKey) => {
      const b = el('button', { type: 'button', class: mode === id ? 'on' : '' }, label);
      if (needsKey && !agency) b.disabled = true;
      b.addEventListener('click', () => setMode(mode === id ? null : id));
      tools.append(b);
    };
    tool('probe', 'Punkt analysieren', false);
    tool('measure', 'Strecke messen', false);
    tool('place', 'Station platzieren', true);
    panel.append(el('p', { class: 'pl-h', text: 'Werkzeuge' }), tools, status);
    if (mode === 'route' || mode === 'measure') {
      panel.append(el('div', { class: 'pl-row' },
        el('button', { type: 'button', onclick: finishDraft }, mode === 'route' ? 'Route speichern' : 'Messung beenden'),
        el('button', { type: 'button', class: 'pl-link', onclick: () => setMode(null) }, 'Abbrechen')));
    }

    // Liste der Stationen
    panel.append(el('p', { class: 'pl-h', text: `Stationen (${stations.length})` }));
    const list = el('ul', { class: 'pl-list' });
    if (!stations.length) list.append(el('li', { class: 'pl-hint', text: 'Noch keine Station auf diesem Körper geplant.' }));
    for (const s of stations) {
      const own = agency && s.agency_id === agency.id;
      const li = el('li', {},
        el('button', { type: 'button', class: 'pl-item', onclick: () => flyTo(s) },
          el('i', { style: `background:${COLORS[s.status] ?? '#fff'}` }),
          el('span', {}, el('strong', { text: s.name }),
            el('small', { text: `${STATION_KINDS[s.kind] ?? s.kind} · ${s.status} · Ø ${fmtKm(2 * s.radius_m)} · ${s.agency?.name ?? ''}` }))));
      if (own) {
        li.append(el('div', { class: 'pl-row' },
          el('button', { type: 'button', class: 'pl-link', onclick: () => openForm(s) }, 'Bearbeiten'),
          el('button', { type: 'button', class: 'pl-link', onclick: () => { routeStation = s; setMode('route'); } }, 'Route zeichnen'),
          el('button', { type: 'button', class: 'pl-link danger', onclick: () => remove(s) }, 'Löschen')));
      }
      list.append(li);
    }
    panel.append(list);
    if (routes.length) {
      panel.append(el('p', { class: 'pl-h', text: `Routen (${routes.length})` }));
      const rl = el('ul', { class: 'pl-list' });
      for (const r of routes) {
        const own = agency && r.agency_id === agency.id;
        rl.append(el('li', {}, el('span', { class: 'pl-route', text: `${ROUTE_KINDS[r.kind] ?? r.kind}: ${r.name} (${r.station?.name ?? ''}) · ${fmtKm(pathLength(r.points.map(([lat, lon]) => ({ lat, lon }))))}` }),
          own ? el('button', { type: 'button', class: 'pl-link danger', onclick: () => removeRoute(r) }, 'Löschen') : null));
      }
      panel.append(rl);
    }
  }

  // --- Daten --------------------------------------------------------------------------------------------
  async function load() {
    try {
      [stations, routes] = await Promise.all([listStations(body.id), listRoutes(body.id)]);
      draw();
      if (!panel.hidden) render();
      btn.textContent = stations.length ? `⌂ Planung (${stations.length})` : '⌂ Planung';
    } catch (err) { say(`Daten konnten nicht geladen werden: ${err.message}`, 'err'); }
  }

  async function login(k) {
    if (!k) return;
    say('Schlüssel wird geprüft …');
    try {
      const a = await checkKey(k);
      if (!a) { say('Ungültiger oder gesperrter Schlüssel.', 'err'); return; }
      key = k; agency = a;
      sessionStorage.setItem(KEY_STORE, k); // nur für diesen Tab, endet mit dem Schließen
      say(`Willkommen, ${a.name}.`, 'ok');
      render();
    } catch (err) { say(err.message, 'err'); }
  }
  function logout() { key = null; agency = null; sessionStorage.removeItem(KEY_STORE); setMode(null); render(); }

  // --- Zeichnen -----------------------------------------------------------------------------------------
  const pos = (lat, lon) => Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
  function draw() {
    for (const e of drawn) entities.remove(e);
    drawn.length = 0;
    for (const s of stations) {
      const c = Color.fromCssColorString(COLORS[s.status] ?? '#ffffff');
      drawn.push(entities.add({
        position: pos(s.lat, s.lon),
        ellipse: { semiMajorAxis: s.radius_m, semiMinorAxis: s.radius_m, material: c.withAlpha(0.18), outline: true, outlineColor: c, height: 0,
          heightReference: hasTerrain ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE },
        point: { pixelSize: 7, color: c, outlineColor: Color.BLACK, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: s.name, font: '600 13px Inter, system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: { x: 0, y: -10 }, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    }
    for (const r of routes) {
      drawn.push(entities.add({
        polyline: { positions: r.points.map(([lat, lon]) => pos(lat, lon)), width: 3, clampToGround: hasTerrain,
          material: Color.fromCssColorString(ROUTE_COLORS[r.kind] ?? '#ffffff') },
      }));
    }
    scene.requestRender();
  }
  function clearTemp() { for (const e of temp) entities.remove(e); temp.length = 0; scene.requestRender(); }
  function drawDraft() {
    clearTemp();
    for (const p of draft) temp.push(entities.add({ position: pos(p.lat, p.lon), point: { pixelSize: 6, color: Color.CYAN, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
    if (draft.length > 1) temp.push(entities.add({ polyline: { positions: draft.map((p) => pos(p.lat, p.lon)), width: 2, material: Color.CYAN, clampToGround: hasTerrain } }));
    scene.requestRender();
  }

  // Länge entlang der Oberfläche (Geodäte auf dem Körper-Ellipsoid)
  function pathLength(points) {
    let m = 0;
    for (let i = 1; i < points.length; i++) {
      const g = new EllipsoidGeodesic(Cartographic.fromDegrees(points[i - 1].lon, points[i - 1].lat), Cartographic.fromDegrees(points[i].lon, points[i].lat), ellipsoid);
      m += g.surfaceDistance;
    }
    return m;
  }

  function flyTo(s) {
    const h = Math.max(s.radius_m * 6, 3000);
    camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat, h, ellipsoid), duration: 1.6 });
  }

  // --- Werkzeuge ------------------------------------------------------------------------------------------
  function setMode(m) {
    mode = m; draft = []; clearTemp();
    viewer.container.style.cursor = m ? 'crosshair' : '';
    const hints = {
      probe: 'Auf die Karte klicken: Koordinaten und Höhe des Punktes.',
      measure: 'Punkte anklicken – die Strecke wird entlang der Oberfläche gemessen.',
      place: 'Auf die Karte klicken, um die Station zu platzieren.',
      route: `Route für „${routeStation?.name ?? ''}“: Punkte anklicken, dann „Route speichern“.`,
    };
    say(m ? hints[m] : '');
    if (!panel.hidden) render();
  }

  // Klick auf die Karte (von globe.js weitergereicht) – true = vom Planer verarbeitet
  async function click(lat, lon) {
    if (!mode) return false;
    if (mode === 'probe') {
      let text = fmtDeg(lat, lon);
      if (hasTerrain) {
        try {
          const [c] = await sampleTerrainMostDetailed(viewer.terrainProvider, [Cartographic.fromDegrees(lon, lat)]);
          if (Number.isFinite(c.height)) text += ` · Höhe ${Math.round(c.height).toLocaleString('de-DE')} m`;
        } catch { /* Höhe optional */ }
      } else text += ' · Höhenmodell: in der Kartenebene „Relief“ ablesbar';
      say(text, 'ok');
      clearTemp();
      temp.push(entities.add({ position: pos(lat, lon), point: { pixelSize: 8, color: Color.CYAN, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      scene.requestRender();
    } else if (mode === 'measure' || mode === 'route') {
      draft.push({ lat, lon });
      drawDraft();
      say(`${draft.length} Punkte · ${fmtKm(pathLength(draft))}`, 'ok');
    } else if (mode === 'place') {
      setMode(null);
      openForm({ lat, lon, radius_m: 500, kind: 'basis', status: 'geplant' });
    }
    return true;
  }

  async function finishDraft() {
    if (mode === 'measure') { say(`Gesamtstrecke: ${fmtKm(pathLength(draft))}`, 'ok'); mode = null; viewer.container.style.cursor = ''; render(); return; }
    if (draft.length < 2) { say('Mindestens zwei Punkte setzen.', 'err'); return; }
    const name = prompt('Name der Route:', `Route ${routes.length + 1}`);
    if (!name) return;
    const kind = prompt(`Art der Route (${Object.keys(ROUTE_KINDS).join(', ')}):`, 'rover');
    if (!ROUTE_KINDS[kind]) { say('Unbekannte Routenart.', 'err'); return; }
    try {
      const id = await saveRoute(key, { station_id: routeStation.id, name: name.slice(0, 120), kind, points: draft.map((p) => [p.lat, p.lon]) });
      if (!id) { say('Schlüssel ungültig – bitte neu anmelden.', 'err'); return; }
      say('Route gespeichert.', 'ok');
      setMode(null); await load();
    } catch (err) { say(err.message, 'err'); }
  }

  // Formular: neue Station oder eigene bearbeiten
  function openForm(s) {
    panel.hidden = false;
    render();
    const f = el('form', { class: 'pl-form' });
    const field = (label, input) => f.append(el('label', {}, el('span', { text: label }), input));
    const name = el('input', { required: '', maxlength: '120', value: s.name ?? '' });
    const kind = el('select', {}, ...Object.entries(STATION_KINDS).map(([v, l]) => { const o = el('option', { value: v, text: l }); if (v === s.kind) o.selected = true; return o; }));
    const stat = el('select', {}, ...['geplant', 'im Bau', 'aktiv'].map((v) => { const o = el('option', { value: v, text: v }); if (v === s.status) o.selected = true; return o; }));
    const radius = el('input', { type: 'number', min: '1', max: '1000000', step: '1', required: '', value: String(s.radius_m ?? 500) });
    const crew = el('input', { type: 'number', min: '0', max: '100000', step: '1', value: s.crew ?? '' });
    const desc = el('textarea', { maxlength: '4000', rows: '4' });
    desc.value = s.description ?? '';
    f.append(el('p', { class: 'pl-h', text: s.id ? 'Station bearbeiten' : 'Neue Station' }), el('p', { class: 'pl-hint', text: fmtDeg(s.lat, s.lon) }));
    field('Name', name); field('Art', kind); field('Status', stat); field('Radius (m)', radius); field('Besatzung', crew); field('Beschreibung / Zweck', desc);
    f.append(el('div', { class: 'pl-row' }, el('button', { type: 'submit' }, 'Speichern'), el('button', { type: 'button', class: 'pl-link', onclick: () => render() }, 'Abbrechen')));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = await saveStation(key, {
          ...(s.id && { id: s.id }), body: body.id, name: name.value.trim(), kind: kind.value, status: stat.value,
          lat: s.lat, lon: s.lon, radius_m: Number(radius.value), crew: crew.value === '' ? '' : Number(crew.value), description: desc.value.trim(),
        });
        if (!id) { say('Schlüssel ungültig – bitte neu anmelden.', 'err'); return; }
        say('Station gespeichert.', 'ok');
        await load();
      } catch (err) { say(err.message, 'err'); }
    });
    panel.insertBefore(f, panel.children[1]);
    name.focus();
    // Vorschau des Radius
    clearTemp();
    temp.push(entities.add({ position: pos(s.lat, s.lon), ellipse: { semiMajorAxis: s.radius_m ?? 500, semiMinorAxis: s.radius_m ?? 500, material: Color.CYAN.withAlpha(0.2), outline: true, outlineColor: Color.CYAN, height: 0 } }));
    radius.addEventListener('input', () => {
      const r = Math.max(1, Number(radius.value) || 1);
      temp[0].ellipse.semiMajorAxis = new ConstantProperty(r);
      temp[0].ellipse.semiMinorAxis = new ConstantProperty(r);
      scene.requestRender();
    });
  }

  async function remove(s) {
    if (!confirm(`Station „${s.name}“ wirklich löschen? Zugehörige Routen werden ebenfalls entfernt.`)) return;
    try { await deleteStation(key, s.id); say('Station gelöscht.', 'ok'); await load(); } catch (err) { say(err.message, 'err'); }
  }
  async function removeRoute(r) {
    if (!confirm(`Route „${r.name}“ löschen?`)) return;
    try { await deleteRoute(key, r.id); await load(); } catch (err) { say(err.message, 'err'); }
  }

  // gespeicherten Schlüssel still prüfen
  if (key) checkKey(key).then((a) => { if (a) agency = a; else { key = null; sessionStorage.removeItem(KEY_STORE); } if (!panel.hidden) render(); }).catch(() => {});
  load();
  // Weltraumwetter: Mond und Mars haben kein schützendes Magnetfeld – Strahlungsstürme betreffen Stationen direkt
  const checkWx = async () => {
    const n = surfaceRadiationNotice(await getScales());
    if (JSON.stringify(n) === JSON.stringify(wxNotice)) return;
    wxNotice = n;
    btn.classList.toggle('wx', !!n); btn.classList.toggle('wx-bad', n?.level === 'bad');
    btn.title = n ? `Stationsplanung – ${n.text}` : 'Stationsplanung';
    if (!panel.hidden && !panel.contains(document.activeElement)) render();
  };
  const stopWx = body.id === 'moon' || body.id === 'mars' ? (checkWx().catch(() => {}), every(300000, checkWx)) : () => {};
  // Live: Stationen/Routen anderer Organisationen erscheinen ohne Neuladen (nicht während Eingabe/Zeichnen)
  const stopLive = every(60000, load, { skip: () => !!mode || panel.contains(document.activeElement) });

  return {
    click,
    active: () => !!mode,
    dispose() { stopLive(); stopWx(); for (const e of [...drawn, ...temp]) entities.remove(e); btn.remove(); panel.remove(); viewer.container.style.cursor = ''; },
  };
}
